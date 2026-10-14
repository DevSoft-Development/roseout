import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Best-effort request accounting. Never report estimated usage as invoiced spend. */
export async function recordLiProviderUsage(input: {
 provider: string; operation: string; status: "estimated" | "failed";
 eventKey: string; estimatedUsd: number; campaignId?: string; runId?: string;
}) {
 const { error } = await supabaseAdmin.rpc("record_location_acquisition_usage", {
  p_event_key: input.eventKey, p_provider: input.provider, p_operation: input.operation,
  p_status: input.status, p_estimated_usd: input.estimatedUsd,
  p_campaign_id: input.campaignId || null, p_run_id: input.runId || null,
 });
 if (error) throw new Error("li_provider_metering_failed:"+error.message);
}

/** Reservation must be committed before making the provider request. */
export async function reserveLiProviderSpend(input: {
 eventKey: string; provider: string; operation: string; estimatedUsd: number;
 campaignId?: string; runId?: string;
}): Promise<boolean> {
 const {data,error}=await supabaseAdmin.rpc("reserve_location_acquisition_spend", {
  p_event_key:input.eventKey,p_provider:input.provider,p_operation:input.operation,
  p_estimated_usd:input.estimatedUsd,p_campaign_id:input.campaignId||null,p_run_id:input.runId||null,
 });
 if(error) throw new Error("li_provider_reservation_failed:"+error.message);
 return data===true;
}
