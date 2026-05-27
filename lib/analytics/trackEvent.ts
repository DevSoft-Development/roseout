import { supabaseAdmin } from "@/lib/supabase-admin";

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

type TrackEventInput = {
  event_name?: string | null;
  event_type?: string | null;
  user_id?: string | null;
  anonymous_id?: string | null;
  session_id?: string | null;
  outing_id?: string | null;
  location_id?: string | null;
  source_location_id?: string | null;
  owner_id?: string | null;
  query?: string | null;
  normalized_query?: string | null;
  search_intent?: Record<string, JsonValue> | null;
  page_path?: string | null;
  referrer?: string | null;
  source?: string | null;
  device_type?: string | null;
  browser?: string | null;
  os?: string | null;
  city?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  location_type?: string | null;
  category?: string | null;
  cuisine?: string | null;
  activity_type?: string | null;
  ranking_position?: number | null;
  result_count?: number | null;
  response_time_ms?: number | null;
  conversion_step?: string | null;
  revenue_impact?: number | null;
  metadata?: Record<string, JsonValue> | null;
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function toRecord(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

export async function trackEvent(input: TrackEventInput) {
  const eventName = typeof input.event_name === "string" && input.event_name.trim() ? input.event_name.trim() : "unknown_event";
  const rawLocationId = input.location_id ?? input.source_location_id ?? null;

  const payload = {
    event_name: eventName,
    event_type: input.event_type ?? null,
    user_id: isUuid(input.user_id) ? input.user_id : null,
    anonymous_id: input.anonymous_id ?? null,
    session_id: input.session_id ?? null,
    outing_id: isUuid(input.outing_id) ? input.outing_id : null,
    location_id: isUuid(rawLocationId) ? rawLocationId : null,
    source_location_id: rawLocationId ? String(rawLocationId) : null,
    owner_id: isUuid(input.owner_id) ? input.owner_id : null,
    query: input.query ?? null,
    normalized_query: input.normalized_query ?? null,
    search_intent: toRecord(input.search_intent),
    page_path: input.page_path ?? null,
    referrer: input.referrer ?? null,
    source: input.source ?? null,
    device_type: input.device_type ?? null,
    browser: input.browser ?? null,
    os: input.os ?? null,
    city: input.city ?? null,
    borough: input.borough ?? null,
    neighborhood: input.neighborhood ?? null,
    location_type: input.location_type ?? null,
    category: input.category ?? null,
    cuisine: input.cuisine ?? null,
    activity_type: input.activity_type ?? null,
    ranking_position: input.ranking_position ?? null,
    result_count: input.result_count ?? null,
    response_time_ms: input.response_time_ms ?? null,
    conversion_step: input.conversion_step ?? null,
    revenue_impact: input.revenue_impact ?? null,
    metadata: toRecord(input.metadata),
  };

  try {
    const { error } = await supabaseAdmin.from("analytics_events").insert(payload);
    if (error) {
      console.error("THEOUTHAVEN_ANALYTICS_EVENT_FAILED", { event_name: payload.event_name, error: error.message });
    }
  } catch (error) {
    console.error("THEOUTHAVEN_ANALYTICS_EVENT_FAILED", { event_name: payload.event_name, error });
  }
}
