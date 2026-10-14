import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Best-effort request accounting. Never report estimated usage as invoiced spend. */
export async function recordLiProviderUsage(input: {
 provider: string; operation: string; status: "estimated" | "failed";
 eventKey: string; estimatedUsd: number; campaignId?: string; runId?: string;
}) {
 const { error } = await supabaseAdmin.schema("private").from("location_acquisition_usage").upsert({
  event_key: input.eventKey, provider: input.provider, operation: input.operation,
  status: input.status, estimated_usd: input.estimatedUsd,
  campaign_id: input.campaignId || null, run_id: input.runId || null,
 }, { onConflict: "event_key", ignoreDuplicates: true });
 if (error) throw new Error("li_provider_metering_failed:"+error.message);
}
