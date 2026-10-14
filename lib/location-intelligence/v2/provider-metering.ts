import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSupabaseUrl } from "@/lib/env";

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
 // Fail closed unless all reservations are routed to one designated write region.
 const authority = process.env.LI_V2_BUDGET_AUTHORITY_REGION;
 const runtimeRegion = process.env.LI_V2_RUNTIME_REGION;
 const configuredProject = process.env.LI_V2_BUDGET_AUTHORITY_SUPABASE_PROJECT_REF;
 const actualHost = new URL(requireSupabaseUrl()).hostname;
 const actualProject = actualHost.endsWith(".supabase.co") ? actualHost.split(".")[0] : "";
 // The East primary is the only budget writer. West DR remains read-only for reservations
 // until a separately audited promotion procedure reconciles spending state.
 const eastPrimaryRef = "ftdsltatyqhtllyyefzp";
 if (authority !== "east" || runtimeRegion !== "east" ||
     configuredProject !== eastPrimaryRef || actualProject !== eastPrimaryRef) {
   throw new Error("li_v2_budget_authority_region_mismatch");
 }
 const {data,error}=await supabaseAdmin.rpc("reserve_location_acquisition_spend", {
  p_event_key:input.eventKey,p_provider:input.provider,p_operation:input.operation,
  p_estimated_usd:input.estimatedUsd,p_campaign_id:input.campaignId||null,p_run_id:input.runId||null,
 });
 if(error) throw new Error("li_provider_reservation_failed:"+error.message);
 return data===true;
}

/** Apply verified provider statement amounts; rejects unknown or exceeding reservations. */
export async function reconcileLiProviderCharge(input: {
 eventKey: string; actualUsd: number; creditUsd?: number;
}): Promise<boolean> {
 if (!Number.isFinite(input.actualUsd) || input.actualUsd < 0 ||
     !Number.isFinite(input.creditUsd ?? 0) || (input.creditUsd ?? 0) < 0 ||
     (input.creditUsd ?? 0) > input.actualUsd) throw new Error("invalid_li_reconciliation_amount");
 const {data,error}=await supabaseAdmin.rpc("reconcile_location_acquisition_usage",{
   p_event_key:input.eventKey,p_actual_usd:input.actualUsd,p_credit_usd:input.creditUsd ?? 0,
 });
 if(error) throw new Error("li_reconciliation_failed:"+error.message);
 return data === true;
}
