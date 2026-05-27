import { supabaseAdmin } from "@/lib/supabase-admin";

export type TrackAnalyticsEventInput = {
  event_name: string;
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
  search_intent?: Record<string, unknown> | null;
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
  metadata?: Record<string, unknown>;
};

export async function trackAnalyticsEvent(input: TrackAnalyticsEventInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const payload = {
      ...input,
      metadata: input.metadata ?? {},
      search_intent: input.search_intent ?? null,
    };
    const { error } = await supabaseAdmin.from("analytics_events").insert(payload);
    if (error) {
      console.error("THEOUTHAVEN_ANALYTICS_EVENT_FAILED", { event_name: input.event_name, error: error.message });
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_analytics_error";
    console.error("THEOUTHAVEN_ANALYTICS_EVENT_FAILED", { event_name: input.event_name, error: message });
    return { ok: false, error: message };
  }
}
