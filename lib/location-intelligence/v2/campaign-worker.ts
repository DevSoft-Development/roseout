import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { executeWithProviderFallback } from "@/lib/location-intelligence/v2/orchestrator";

type Run = { id: string; campaign_id: string };
type Coverage = { market:string; area_key:string; location_kind:string; category:string; target_count:number; current_count:number };

export async function processQueuedAcquisitionCampaign() {
  const { data, error } = await supabaseAdmin.rpc("li_v2_claim_campaign_run");
  if (error) throw error;
  if (!data) return { claimed:false };
  const run = data as Run;
  const { data: coverage, error: coverageError } = await supabaseAdmin
    .from("location_coverage_state")
    .select("market,area_key,location_kind,category,target_count,current_count")
    .gt("target_count",0)
    .order("priority_score",{ascending:false}).limit(10);
  if (coverageError) throw coverageError;
  let processed=0, discovered=0, failed=0;
  for (const target of (coverage || []) as Coverage[]) {
    if (target.current_count >= target.target_count) continue;
    const {data:permitted,error:permissionError} = await supabaseAdmin
      .rpc("li_v2_campaign_run_permitted",{p_run_id:run.id});
    if (permissionError || permitted !== true) break;
    const query = `${target.category.replace(/_/g," ")} ${target.location_kind} ${target.area_key} ${target.market} official website`;
    let hit=0, miss=0;
    try {
      // A single paid, campaign-reserved provider request. No automatic publication:
      // candidates require identity resolution, dedupe, and quality review.
      const result = await executeWithProviderFallback({
        capability:"web_context",purpose:"discovery",
        input:{query,count:5,acquisitionCampaignId:run.campaign_id,
          acquisitionEventKey:`li-v2-${run.id.replace(/-/g,"")}-${processed}`},
      });
      if (result.data) { discovered++; hit=1; }
    } catch (e) {
      failed++; miss=1;
      // An uncertain paid outcome must stop the batch to avoid double billing.
      if (e instanceof Error && e.message.includes("paid_acquisition_outcome_uncertain")) {
        await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",
          {p_run_id:run.id,p_processed:processed,p_discovered:discovered,p_failed:failed,p_status:"failed",p_error:e.message});
        return {claimed:true,runId:run.id,processed,discovered,failed,stopped:"uncertain_charge"};
      }
    }
    processed++;
    const {data:accepted,error:checkpointError} = await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",
      {p_run_id:run.id,p_processed:1,p_discovered:hit,p_failed:miss,p_status:"running"});
    // Operator pause/cancel won the lock; do not issue another request.
    if (checkpointError || accepted !== true) break;
    discovered=0;failed=0;
  }
  const {data:permitted}=await supabaseAdmin.rpc("li_v2_campaign_run_permitted",{p_run_id:run.id});
  if (permitted === true) await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",
    {p_run_id:run.id,p_processed:0,p_discovered:0,p_failed:0,p_status:"completed"});
  return {claimed:true,runId:run.id,processed};
}
