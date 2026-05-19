import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };
const sum = (rows: any[], key: string) => rows.reduce((t, r) => t + Number(r?.[key] || 0), 0);
const ratio = (n: number, d: number) => (d > 0 ? n / d : 0);
const startDateFor = (range: string) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((RANGE_DAYS[range] || 30) - 1)); return d.toISOString().slice(0,10); };

async function canViewLocation(user: any, locationId: string) {
  const { data } = await supabaseAdmin.from("locations").select("id, owner_user_id, owner_email, claimed_by_email").eq("id", locationId).maybeSingle();
  if (!data) return false;
  const email = String(user?.email || "").toLowerCase();
  return data.owner_user_id === user.id || String(data.owner_email || "").toLowerCase() === email || String(data.claimed_by_email || "").toLowerCase() === email;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("location_id") || "";
  const range = searchParams.get("range") || "30d";
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location_id" }, { status: 400 });
  if (!(await canViewLocation(user, locationId))) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const fromDate = startDateFor(range);
  const [dailyResult, hourlyResult, customerResult, locationResult] = await Promise.all([
    supabaseAdmin.from("location_daily_analytics").select("*").eq("location_id", locationId).gte("analytics_date", fromDate).order("analytics_date", { ascending: true }),
    supabaseAdmin.from("location_hourly_analytics").select("*").eq("location_id", locationId).order("day_of_week", { ascending: true }).order("hour_of_day", { ascending: true }),
    supabaseAdmin.from("location_customer_insights").select("*").eq("location_id", locationId),
    supabaseAdmin.from("locations").select("subscription_plan,description,website,phone,reservation_url,cuisine,categories,tags,rating,photos,gallery_images,is_promoted").eq("id", locationId).maybeSingle(),
  ]);
  if (dailyResult.error) return NextResponse.json({ success: false, error: dailyResult.error.message }, { status: 500 });

  const daily = dailyResult.data || [];
  const hourly = hourlyResult.data || [];
  const customers = customerResult.data || [];
  const location: any = locationResult.data || {};

  const profileViews = sum(daily, "profile_views");
  const searchAppearances = sum(daily, "search_appearances");
  const searchClicks = sum(daily, "search_clicks");
  const reservationStarts = sum(daily, "reservation_starts");
  const reservationCompletions = sum(daily, "reservation_completions");
  const reservationCancellations = sum(daily, "reservation_cancellations");
  const hasReservationLink = Boolean(location?.reservation_url);
  const mediaCount = (Array.isArray(location?.photos) ? location.photos.length : 0) + (Array.isArray(location?.gallery_images) ? location.gallery_images.length : 0);
  const profileCompleteness = [location?.description, location?.website, location?.phone].filter(Boolean).length / 3;
  const visibilityScore = Math.min(100, Math.round(profileCompleteness * 25 + (hasReservationLink ? 15 : 0) + Math.min(15, mediaCount * 2) + Math.min(20, profileViews / 100) + Math.min(15, reservationStarts / 20) + (location?.is_promoted ? 10 : 0)));

  return NextResponse.json({
    success: true,
    plan: String(location?.subscription_plan || "free").toLowerCase() === "pro" ? "pro" : "free",
    summary: {
      profile_views: profileViews,
      search_appearances: searchAppearances,
      search_clicks: searchClicks,
      click_through_rate: ratio(searchClicks, searchAppearances),
      reservation_starts: reservationStarts,
      reservation_completions: reservationCompletions,
      reservation_conversion_rate: ratio(reservationCompletions, reservationStarts),
      cancellation_rate: ratio(reservationCancellations, reservationCompletions),
    },
    daily,
    hourly,
    customer_insights: { average_party_size: customers.length ? customers.reduce((t: number, c: any) => t + Number(c.preferred_party_size || 0), 0) / customers.length : 0 },
    visibility_score: visibilityScore,
    visibility_breakdown: [
      { label: "Profile completeness", score: Math.round(profileCompleteness * 25), max: 25 },
      { label: "Photos and media", score: Math.min(15, mediaCount * 2), max: 15 },
      { label: "Reservation readiness", score: hasReservationLink ? 15 : 0, max: 15 },
      { label: "Engagement", score: Math.min(45, Math.round(profileViews / 100) + Math.round(reservationStarts / 20)), max: 45 },
    ],
    visibility_checklist: [
      { label: "Add reservation link", done: hasReservationLink, cta: "Get More Reservations" },
      { label: "Add photos", done: mediaCount > 3, cta: "Boost Your Visibility" },
      { label: "Complete profile", done: profileCompleteness > 0.66, cta: "Complete Profile" },
      { label: "Upgrade to Pro", done: false, cta: "Upgrade to Pro" },
      { label: "Promote listing", done: Boolean(location?.is_promoted), cta: "Feature This Location" },
    ],
    locked_features: ["Top Search Terms", "Customer Intent Insights", "Advanced Reservation Analytics", "Competitor Visibility", "Conversion Funnels", "AI Growth Recommendations", "Benchmarking", "Predictive Revenue Insights", "Promotion Analytics"].map((name, index) => ({ key: `premium_${index}`, name, locked: true, cta: "Upgrade to Pro" })),
    growth_recommendations: [
      !hasReservationLink ? { title: "Add reservation link", detail: "Add a reservation link to capture more booking intent.", cta: "Get More Reservations" } : null,
      profileViews > 100 && reservationStarts < profileViews * 0.08 ? { title: "Views but low clicks", detail: "Your profile is getting views but low clicks. Improve photos or description.", cta: "Boost Your Visibility" } : null,
      !location?.is_promoted && profileViews > 200 ? { title: "Promoted listing candidate", detail: "You are a strong candidate for promoted listings.", cta: "Feature This Location" } : null,
    ].filter(Boolean),
    reservation_intelligence: {
      busiest_day: hourly[0]?.day_of_week ?? null,
      busiest_time: hourly[0]?.hour_of_day ?? null,
      reservation_starts: reservationStarts,
      reservation_completions: reservationCompletions,
      cancellation_rate: ratio(reservationCancellations, reservationCompletions),
      average_party_size: customers.length ? customers.reduce((t: number, c: any) => t + Number(c.preferred_party_size || 0), 0) / customers.length : 0,
      booking_conversion_rate: ratio(reservationCompletions, reservationStarts),
    },
    upgrade_triggers: [
      profileViews > 250 ? { trigger_type: "high_profile_views", priority: "high", reason: "High profile views on Free plan", suggested_cta: "Unlock Pro Insights", created_at: new Date().toISOString() } : null,
      reservationStarts > 80 ? { trigger_type: "high_reservation_clicks", priority: "medium", reason: "High reservation clicks but no Pro plan", suggested_cta: "Upgrade to Pro", created_at: new Date().toISOString() } : null,
      !hasReservationLink ? { trigger_type: "missing_reservation_link", priority: "high", reason: "Missing reservation link", suggested_cta: "Get More Reservations", created_at: new Date().toISOString() } : null,
    ].filter(Boolean),
    benchmarking: { views_percentile: Math.min(99, Math.round(profileViews / 10)), clicks_percentile: Math.min(99, Math.round(searchClicks / 5)), saves_percentile: Math.min(99, Math.round(sum(daily, "saves") / 3)), reservation_clicks_percentile: Math.min(99, Math.round(reservationStarts / 4)) },
    predictive_insights: [
      { title: "Conversion lift estimate", detail: "If reservation clicks improve by 20%, estimated bookings may increase." },
      { title: "Reservation link opportunity", detail: "Adding a reservation link could improve conversion." },
      { title: "Promotion estimate", detail: "Promoted listings may increase visibility based on similar locations." },
    ],
    promotion_opportunities: [
      { title: "Promoted listing", detail: "Increase search and discovery surface area.", cta: "Feature This Location" },
      { title: "Homepage feature", detail: "Premium placement for high-intent discovery.", cta: "Boost Your Visibility" },
    ],
    heatmap: hourly,
  });
}
