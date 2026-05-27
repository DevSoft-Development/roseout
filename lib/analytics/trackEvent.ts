import { supabaseAdmin } from "@/lib/supabase-admin";

type TrackAnalyticsEventInput = {
  event_name: string;
  user_id?: string | null;
  session_id?: string | null;
  location_id?: string | null;
  outing_id?: string | null;
  query?: string | null;
  page_path?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
};

export async function trackAnalyticsEvent(input: TrackAnalyticsEventInput) {
  try {
    const { error } = await supabaseAdmin.from("analytics_events").insert({
      event_name: input.event_name,
      user_id: input.user_id ?? null,
      session_id: input.session_id ?? null,
      location_id: input.location_id ?? null,
      outing_id: input.outing_id ?? null,
      query: input.query ?? null,
      page_path: input.page_path ?? null,
      source: input.source ?? null,
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.error("THEOUTHAVEN_ANALYTICS_EVENT_FAILED", {
        event_name: input.event_name,
        location_id: input.location_id ?? null,
        outing_id: input.outing_id ?? null,
      });
      return;
    }

    console.info("THEOUTHAVEN_ANALYTICS_EVENT_TRACKED", {
      event_name: input.event_name,
      location_id: input.location_id ?? null,
      outing_id: input.outing_id ?? null,
    });
  } catch {
    console.error("THEOUTHAVEN_ANALYTICS_EVENT_FAILED", {
      event_name: input.event_name,
      location_id: input.location_id ?? null,
      outing_id: input.outing_id ?? null,
    });
  }
}
