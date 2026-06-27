import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function trackGrowthProEvent(locationId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  if (!locationId || !eventType) return;
  await supabaseAdmin.from("location_analytics_events").insert({
    location_id: locationId,
    event_type: eventType,
    metadata,
  }).then(undefined, () => undefined);
}
