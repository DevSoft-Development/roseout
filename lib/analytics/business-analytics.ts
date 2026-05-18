import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type BusinessAnalyticsEventType =
  | "profile_view"
  | "search_appearance"
  | "search_click"
  | "reservation_started"
  | "reservation_completed"
  | "reservation_cancelled"
  | "directions_click"
  | "website_click"
  | "phone_click"
  | "share_click";

export const BUSINESS_ANALYTICS_EVENT_TYPES = [
  "profile_view",
  "search_appearance",
  "search_click",
  "reservation_started",
  "reservation_completed",
  "reservation_cancelled",
  "directions_click",
  "website_click",
  "phone_click",
  "share_click",
] as const satisfies readonly BusinessAnalyticsEventType[];

type TrackLocationAnalyticsEventInput = {
  locationId: string;
  userId?: string | null;
  eventType: BusinessAnalyticsEventType;
  eventSource?: string | null;
  sessionId?: string | null;
  searchQuery?: string | null;
  outingType?: string | null;
  referrer?: string | null;
  metadata?: Record<string, unknown> | null;
};

function todayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function eventDailyIncrement(eventType: BusinessAnalyticsEventType) {
  return {
    profile_views: eventType === "profile_view" ? 1 : 0,
    search_appearances: eventType === "search_appearance" ? 1 : 0,
    search_clicks: eventType === "search_click" ? 1 : 0,
    directions_clicks: eventType === "directions_click" ? 1 : 0,
    website_clicks: eventType === "website_click" ? 1 : 0,
    phone_clicks: eventType === "phone_click" ? 1 : 0,
    share_clicks: eventType === "share_click" ? 1 : 0,
    reservation_starts: eventType === "reservation_started" ? 1 : 0,
    reservation_completions: eventType === "reservation_completed" ? 1 : 0,
    reservation_cancellations: eventType === "reservation_cancelled" ? 1 : 0,
  };
}

function eventHourlyIncrement(eventType: BusinessAnalyticsEventType) {
  return {
    profile_views: eventType === "profile_view" ? 1 : 0,
    search_clicks: eventType === "search_click" ? 1 : 0,
    reservations: eventType === "reservation_completed" ? 1 : 0,
    cancellations: eventType === "reservation_cancelled" ? 1 : 0,
  };
}

async function updateDailyAnalytics(input: TrackLocationAnalyticsEventInput, now: Date) {
  const analyticsDate = todayKey(now);
  const inc = eventDailyIncrement(input.eventType);
  const revenue =
    input.eventType === "reservation_completed"
      ? safeNumber(input.metadata?.amount_paid)
      : 0;

  const { data: existing } = await supabaseAdmin
    .from("location_daily_analytics")
    .select("*")
    .eq("location_id", input.locationId)
    .eq("analytics_date", analyticsDate)
    .maybeSingle();

  const reservationCompletions =
    safeNumber(existing?.reservation_completions) + inc.reservation_completions;
  const totalRevenue = safeNumber(existing?.total_revenue) + revenue;

  const row = {
    location_id: input.locationId,
    analytics_date: analyticsDate,
    profile_views: safeNumber(existing?.profile_views) + inc.profile_views,
    search_appearances:
      safeNumber(existing?.search_appearances) + inc.search_appearances,
    search_clicks: safeNumber(existing?.search_clicks) + inc.search_clicks,
    directions_clicks:
      safeNumber(existing?.directions_clicks) + inc.directions_clicks,
    website_clicks: safeNumber(existing?.website_clicks) + inc.website_clicks,
    phone_clicks: safeNumber(existing?.phone_clicks) + inc.phone_clicks,
    share_clicks: safeNumber(existing?.share_clicks) + inc.share_clicks,
    reservation_starts:
      safeNumber(existing?.reservation_starts) + inc.reservation_starts,
    reservation_completions: reservationCompletions,
    reservation_cancellations:
      safeNumber(existing?.reservation_cancellations) + inc.reservation_cancellations,
    total_revenue: totalRevenue,
    average_booking_value:
      reservationCompletions > 0 ? totalRevenue / reservationCompletions : 0,
    unique_visitors: safeNumber(existing?.unique_visitors),
    repeat_visitors: safeNumber(existing?.repeat_visitors),
    updated_at: now.toISOString(),
  };

  if (existing?.id) {
    await supabaseAdmin
      .from("location_daily_analytics")
      .update(row)
      .eq("id", existing.id)
      .throwOnError();
    return;
  }

  await supabaseAdmin.from("location_daily_analytics").insert(row).throwOnError();
}

async function updateHourlyAnalytics(input: TrackLocationAnalyticsEventInput, now: Date) {
  const inc = eventHourlyIncrement(input.eventType);
  const dayOfWeek = now.getUTCDay();
  const hourOfDay = now.getUTCHours();

  if (!Object.values(inc).some(Boolean)) return;

  const { data: existing } = await supabaseAdmin
    .from("location_hourly_analytics")
    .select("*")
    .eq("location_id", input.locationId)
    .eq("day_of_week", dayOfWeek)
    .eq("hour_of_day", hourOfDay)
    .maybeSingle();

  const row = {
    location_id: input.locationId,
    day_of_week: dayOfWeek,
    hour_of_day: hourOfDay,
    profile_views: safeNumber(existing?.profile_views) + inc.profile_views,
    search_clicks: safeNumber(existing?.search_clicks) + inc.search_clicks,
    reservations: safeNumber(existing?.reservations) + inc.reservations,
    cancellations: safeNumber(existing?.cancellations) + inc.cancellations,
    updated_at: now.toISOString(),
  };

  if (existing?.id) {
    await supabaseAdmin
      .from("location_hourly_analytics")
      .update(row)
      .eq("id", existing.id)
      .throwOnError();
    return;
  }

  await supabaseAdmin.from("location_hourly_analytics").insert(row).throwOnError();
}

async function updateCustomerInsights(input: TrackLocationAnalyticsEventInput, now: Date) {
  if (!input.userId) return;

  const { data: existing } = await supabaseAdmin
    .from("location_customer_insights")
    .select("*")
    .eq("location_id", input.locationId)
    .eq("user_id", input.userId)
    .maybeSingle();

  const isReservation = input.eventType === "reservation_completed";
  const isCancellation = input.eventType === "reservation_cancelled";
  const isVisit = ["profile_view", "search_click", "reservation_started"].includes(
    input.eventType,
  );
  const preferredPartySize = safeNumber(input.metadata?.party_size) || existing?.preferred_party_size || null;

  const row = {
    location_id: input.locationId,
    user_id: input.userId,
    visit_count: safeNumber(existing?.visit_count) + (isVisit ? 1 : 0),
    reservation_count: safeNumber(existing?.reservation_count) + (isReservation ? 1 : 0),
    cancelled_count: safeNumber(existing?.cancelled_count) + (isCancellation ? 1 : 0),
    preferred_outing_type: input.outingType || existing?.preferred_outing_type || null,
    preferred_party_size: preferredPartySize,
    last_seen_at: now.toISOString(),
    metadata: {
      ...(typeof existing?.metadata === "object" && existing.metadata ? existing.metadata : {}),
      ...(input.metadata || {}),
    },
    updated_at: now.toISOString(),
  };

  if (existing?.id) {
    await supabaseAdmin
      .from("location_customer_insights")
      .update(row)
      .eq("id", existing.id)
      .throwOnError();
    return;
  }

  await supabaseAdmin
    .from("location_customer_insights")
    .insert({ ...row, first_seen_at: now.toISOString(), visit_count: Math.max(row.visit_count, 1) })
    .throwOnError();
}

export async function trackLocationAnalyticsEvent(input: TrackLocationAnalyticsEventInput) {
  try {
    if (!input.locationId || !BUSINESS_ANALYTICS_EVENT_TYPES.includes(input.eventType)) {
      return { success: false };
    }

    const now = new Date();

    await supabaseAdmin
      .from("location_analytics_events")
      .insert({
        location_id: input.locationId,
        user_id: input.userId || null,
        event_type: input.eventType,
        event_source: input.eventSource || "web",
        session_id: input.sessionId || null,
        search_query: input.searchQuery || null,
        outing_type: input.outingType || null,
        referrer: input.referrer || null,
        metadata: input.metadata || {},
        created_at: now.toISOString(),
      })
      .throwOnError();

    await Promise.allSettled([
      updateDailyAnalytics(input, now),
      updateHourlyAnalytics(input, now),
      updateCustomerInsights(input, now),
    ]);

    return { success: true };
  } catch (error) {
    console.error("Business analytics tracking failed", error);
    return { success: false };
  }
}

export function isBusinessPro(locationOrBusiness: Record<string, unknown> | null | undefined) {
  const values = [
    locationOrBusiness?.plan,
    locationOrBusiness?.business_plan,
    locationOrBusiness?.subscription_plan,
    locationOrBusiness?.pricing_plan,
    locationOrBusiness?.tier,
    locationOrBusiness?.subscription_tier,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  const status = String(
    locationOrBusiness?.subscription_status || locationOrBusiness?.plan_status || "",
  ).toLowerCase();

  return (
    values.some((value) => ["pro", "premium", "business_pro"].includes(value)) ||
    (values.some((value) => value.includes("pro")) && status !== "cancelled")
  );
}
