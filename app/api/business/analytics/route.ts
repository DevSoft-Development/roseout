import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getMetadataAdminUser } from "@/lib/admin-auth";

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

function sum(rows: any[], key: string) {
  return rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);
}
function ratio(n: number, d: number) { return d > 0 ? n / d : 0; }
function pct(current: number, previous: number) { return previous > 0 ? ((current - previous) / previous) * 100 : 0; }
function startDateFor(range: string, extraOffset = 0) {
  const days = RANGE_DAYS[range] || RANGE_DAYS["30d"];
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (days - 1 + extraOffset));
  return date.toISOString().slice(0, 10);
}

async function isAdminUser(user: any) {
  if (!user?.email) return false;
  const { data } = await supabaseAdmin.from("admin_users").select("role").eq("email", user.email.toLowerCase()).maybeSingle();
  if (data?.role && ["superuser", "admin", "editor", "viewer"].includes(data.role)) return true;
  return Boolean(getMetadataAdminUser(user));
}

async function canViewLocation(user: any, locationId: string) {
  if (!user) return false;
  if (await isAdminUser(user)) return true;
  const { data: location } = await supabaseAdmin.from("locations").select("id, owner_user_id, owner_email, claimed_by_email, is_pro").eq("id", locationId).maybeSingle();
  if (!location) return false;
  const email = String(user.email || "").toLowerCase();
  return location.owner_user_id === user.id || (email && String(location.owner_email || "").toLowerCase() === email) || (email && String(location.claimed_by_email || "").toLowerCase() === email);
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
  const prevFromDate = startDateFor(range, RANGE_DAYS[range] || 30);
  const prevToDate = startDateFor(range, 1);

  const [dailyResult, prevDailyResult, hourlyResult, customerResult] = await Promise.all([
    supabaseAdmin.from("location_daily_analytics").select("*").eq("location_id", locationId).gte("analytics_date", fromDate).order("analytics_date", { ascending: true }),
    supabaseAdmin.from("location_daily_analytics").select("*").eq("location_id", locationId).gte("analytics_date", prevFromDate).lt("analytics_date", prevToDate),
    supabaseAdmin.from("location_hourly_analytics").select("*").eq("location_id", locationId).order("day_of_week", { ascending: true }).order("hour_of_day", { ascending: true }),
    supabaseAdmin.from("location_customer_insights").select("*").eq("location_id", locationId),
  ]);

  if (dailyResult.error) return NextResponse.json({ success: false, error: dailyResult.error.message }, { status: 500 });

  const daily = dailyResult.data || [];
  const prevDaily = prevDailyResult.data || [];
  const hourly = hourlyResult.data || [];
  const customers = customerResult.data || [];

  const profileViews = sum(daily, "profile_views");
  const searchAppearances = sum(daily, "search_appearances");
  const searchClicks = sum(daily, "search_clicks");
  const reservationStarts = sum(daily, "reservation_starts");
  const reservationCompletions = sum(daily, "reservation_completions");
  const reservationCancellations = sum(daily, "reservation_cancellations");

  const uniqueVisitors = Math.max(sum(daily, "unique_visitors"), new Set(customers.map((c) => c.user_id).filter(Boolean)).size);
  const repeatVisitors = Math.max(sum(daily, "repeat_visitors"), customers.filter((c) => Number(c.visit_count || 0) > 1).length);

  const topOutingTypes = Object.entries(customers.reduce<Record<string, number>>((counts, customer) => {
    const key = String(customer.preferred_outing_type || "").trim();
    if (key) counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }));

  const bestHours = [...hourly].sort((a, b) => Number(b.reservations || 0) - Number(a.reservations || 0)).slice(0, 6);
  const popularTimes = bestHours.map((row) => ({ day_of_week: row.day_of_week, hour_of_day: row.hour_of_day }));

  const currentViews = profileViews;
  const prevViews = sum(prevDaily, "profile_views");
  const currentClicks = reservationStarts + searchClicks;
  const prevClicks = sum(prevDaily, "reservation_starts") + sum(prevDaily, "search_clicks");
  const currentCompleted = reservationCompletions;
  const prevCompleted = sum(prevDaily, "reservation_completions");

  const visibilityScore = Math.min(100, Math.round(ratio(profileViews + searchAppearances, Math.max(1, daily.length))));
  const conversionScore = Math.min(100, Math.round(ratio(reservationCompletions, Math.max(1, reservationStarts)) * 100));
  const profileCompleteness = topOutingTypes.length > 0 ? 82 : 55;
  const opportunityScore = Math.max(30, Math.round((visibilityScore + (100 - conversionScore) + profileCompleteness) / 3));

  return NextResponse.json({
    success: true,
    range,
    summary: {
      profile_views: profileViews,
      search_appearances: searchAppearances,
      search_clicks: searchClicks,
      click_through_rate: ratio(searchClicks, searchAppearances),
      website_clicks: sum(daily, "website_clicks"),
      phone_clicks: sum(daily, "phone_clicks"),
      directions_clicks: sum(daily, "directions_clicks"),
      plan_outing_clicks: sum(daily, "plan_outing_clicks"),
      saves: sum(daily, "favorites_count"),
      reservation_starts: reservationStarts,
      reservation_completions: reservationCompletions,
      reservation_conversion_rate: ratio(reservationCompletions, reservationStarts),
      reservation_cancellations: reservationCancellations,
      cancellation_rate: ratio(reservationCancellations, reservationCompletions),
      unique_visitors: uniqueVisitors,
      repeat_visitors: repeatVisitors,
      trending_score: Math.min(100, Math.round(50 + pct(currentViews, prevViews) / 2)),
      opportunity_score: opportunityScore,
      profile_completeness: profileCompleteness,
      visibility_score: visibilityScore,
      growth_score: Math.round((visibilityScore + conversionScore + profileCompleteness) / 3),
      deltas: {
        profile_views_pct: pct(currentViews, prevViews),
        engagement_pct: pct(currentClicks, prevClicks),
        reservations_pct: pct(currentCompleted, prevCompleted),
      },
    },
    visibility: {
      homepage_appearances: sum(daily, "homepage_appearances"),
      featured_outing_appearances: sum(daily, "featured_outing_appearances"),
      go_appearances: sum(daily, "go_appearances"),
      promoted_impressions: sum(daily, "promoted_impressions"),
    },
    engagement: {
      reservation_link_clicks: sum(daily, "reservation_link_clicks"),
      map_directions_clicks: sum(daily, "directions_clicks"),
      social_share_clicks: sum(daily, "social_share_clicks"),
      engagement_rate: ratio(currentClicks, Math.max(1, profileViews)),
    },
    reservations: {
      average_party_size: customers.length > 0 ? customers.reduce((t, c) => t + Number(c.preferred_party_size || 0), 0) / customers.length : 0,
      busiest_times: popularTimes,
      top_items: [],
    },
    daily,
    hourly,
    customer_insights: {
      repeat_visitor_rate: ratio(repeatVisitors, uniqueVisitors),
      top_outing_types: topOutingTypes,
      top_search_terms: [],
      popular_times: popularTimes,
      paired_nearby_businesses: [],
    },
    recommendations: [
      "Add reservation link",
      "Add more photos",
      "Improve description",
      "Upgrade to Pro",
      "Promote your listing",
      "Join featured outings",
      "Improve profile completeness",
    ],
  });
}
