import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  BUSINESS_ANALYTICS_EVENT_TYPES,
  trackLocationAnalyticsEvent,
  type BusinessAnalyticsEventType,
} from "@/lib/analytics/business-analytics";

const MAX_METADATA_BYTES = 8_000;
const MAX_TEXT_LENGTH = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCATION_EVENT_TYPES = ["view", "click", "save", "booking", "skip"] as const;
const RESULT_TYPES = new Set(["restaurant", "activity", "pair", "matched_location"]);

type LocationEventType = (typeof LOCATION_EVENT_TYPES)[number];

const LEGACY_LOCATION_EVENT_MAP: Record<string, LocationEventType> = {
  profile_view: "view",
  search_appearance: "view",
  search_click: "click",
  directions_click: "click",
  website_click: "click",
  phone_click: "click",
  share_click: "save",
  reservation_started: "click",
  reservation_completed: "booking",
  reservation_cancelled: "skip",
};

const BUSINESS_EVENT_BY_LOCATION_EVENT: Record<LocationEventType, BusinessAnalyticsEventType> = {
  view: "profile_view",
  click: "search_click",
  save: "share_click",
  booking: "reservation_completed",
  skip: "search_appearance",
};

const BUSINESS_EVENT_BY_LEGACY_EVENT: Partial<Record<string, BusinessAnalyticsEventType>> = {
  profile_view: "profile_view",
  search_appearance: "search_appearance",
  search_click: "search_click",
  directions_click: "directions_click",
  website_click: "website_click",
  phone_click: "phone_click",
  reservation_started: "reservation_started",
  reservation_completed: "reservation_completed",
  reservation_cancelled: "reservation_cancelled",
  share_click: "share_click",
};

function cleanString(value: unknown, max = MAX_TEXT_LENGTH) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function cleanMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const json = JSON.stringify(value);
  if (json.length > MAX_METADATA_BYTES) return { truncated: true };
  return value as Record<string, unknown>;
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanPosition(value: unknown) {
  const position = Number(value);
  return Number.isInteger(position) && position > 0 && position <= 1000 ? position : null;
}

function cleanBoolean(value: unknown) {
  return value === true || value === "true";
}

function isValidLocationId(value: string | undefined) {
  return Boolean(value && UUID_PATTERN.test(value));
}

function buildLocationMetadata(body: Record<string, unknown>, eventType: LocationEventType) {
  return {
    ...cleanMetadata(body.metadata),
    source_page: cleanString(body.source_page, 160),
    source_section: cleanString(body.source_section, 160),
    campaign_id: cleanString(body.campaign_id, 160),
    location_event_type: eventType,
    search_id: cleanString(body.search_id, 180),
    result_position: cleanPosition(body.result_position),
    result_type: cleanString(body.result_type, 40),
    event_id: cleanString(body.event_id, 180),
    traffic_type: cleanString(body.traffic_type, 40) || "production",
    is_test_event: cleanBoolean(body.is_test_event),
    test_run_id: cleanString(body.test_run_id, 180),
  };
}

async function incrementLocationAnalytics(locationId: string, eventType: LocationEventType) {
  const { data: existing, error: selectError } = await supabaseAdmin
    .from("location_analytics")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();
  if (selectError) throw selectError;
  const nextViews = safeNumber(existing?.views) + (eventType === "view" ? 1 : 0);
  const nextClicks = safeNumber(existing?.clicks) + (eventType === "click" ? 1 : 0);
  const nextSaves = safeNumber(existing?.saves) + (eventType === "save" ? 1 : 0);
  const nextBookings = safeNumber(existing?.bookings) + (eventType === "booking" ? 1 : 0);
  const nextSkips = safeNumber(existing?.skips) + (eventType === "skip" ? 1 : 0);
  const row = {
    location_id: locationId,
    views: nextViews,
    clicks: nextClicks,
    saves: nextSaves,
    bookings: nextBookings,
    skips: nextSkips,
    conversion_rate: nextClicks > 0 ? Number((nextBookings / nextClicks).toFixed(4)) : 0,
    updated_at: new Date().toISOString(),
  };
  if (existing?.id) {
    const { error } = await supabaseAdmin.from("location_analytics").update(row).eq("id", existing.id);
    if (error) throw error;
    return row;
  }
  const { error } = await supabaseAdmin.from("location_analytics").insert(row);
  if (error) throw error;
  return row;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const locationId = cleanString(body.location_id, 80);
    const rawEventType = cleanString(body.event_type, 80);
    const eventType = (rawEventType && (LOCATION_EVENT_TYPES.includes(rawEventType as LocationEventType)
      ? rawEventType
      : LEGACY_LOCATION_EVENT_MAP[rawEventType])) as LocationEventType | undefined;
    if (!locationId) return NextResponse.json({ success: false, error: "Missing location_id." }, { status: 400 });
    if (!isValidLocationId(locationId)) return NextResponse.json({ success: false, error: "Invalid location_id." }, { status: 400 });
    if (!eventType || !LOCATION_EVENT_TYPES.includes(eventType)) return NextResponse.json({ success: false, error: "Invalid event_type." }, { status: 400 });

    const resultType = cleanString(body.result_type, 40);
    if (resultType && !RESULT_TYPES.has(resultType)) {
      return NextResponse.json({ success: false, error: "Invalid result_type." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const isTestEvent = cleanBoolean(body.is_test_event);
    const metadata = buildLocationMetadata(body, eventType);
    const analytics = isTestEvent ? null : await incrementLocationAnalytics(locationId, eventType);
    const businessEventType = rawEventType && BUSINESS_ANALYTICS_EVENT_TYPES.includes(rawEventType as BusinessAnalyticsEventType)
      ? (rawEventType as BusinessAnalyticsEventType)
      : BUSINESS_EVENT_BY_LEGACY_EVENT[rawEventType || ""] || BUSINESS_EVENT_BY_LOCATION_EVENT[eventType];

    const tracking = await trackLocationAnalyticsEvent({
      locationId,
      userId: user?.id || null,
      eventType: businessEventType,
      eventSource: cleanString(body.event_source, 80) || "web",
      sessionId: cleanString(body.session_id, 180),
      searchId: cleanString(body.search_id, 180),
      eventId: cleanString(body.event_id, 180),
      resultPosition: cleanPosition(body.result_position),
      resultType: resultType || null,
      trafficType: isTestEvent ? "internal_test" : "production",
      isTestEvent,
      testRunId: cleanString(body.test_run_id, 180),
      searchQuery: cleanString(body.search_query, 500),
      outingType: cleanString(body.outing_type, 160),
      referrer: cleanString(body.referrer, 500) || request.headers.get("referer"),
      metadata,
    });

    if (!tracking.success) {
      return NextResponse.json({ success: false, error: "Analytics event was not persisted." }, { status: 500 });
    }

    return NextResponse.json({ success: true, event_type: eventType, analytics, is_test_event: isTestEvent });
  } catch (error) {
    console.error("Location analytics event API failed", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Analytics update failed." }, { status: 500 });
  }
}
