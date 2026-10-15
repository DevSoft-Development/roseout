import "server-only";
import { createHash } from "node:crypto";
import { discoverUnseenGooglePlaceIds } from "@/lib/location-intelligence/v2/acquisition-identity-gate";
import { dedupeStagedLocationsChunk } from "@/lib/location-growth/dedupeStaging";
import { publishReadyStagedLocations } from "@/lib/location-growth/publishReady";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LOCATION_INTELLIGENCE_ADAPTERS } from "@/lib/location-intelligence/v2/orchestrator";

type Run = { id: string; campaign_id: string; processed: number };
type Coverage = { market:string; area_key:string; location_kind:string; category:string; target_count:number; current_count:number };

export async function processQueuedAcquisitionCampaign() {
  // A hard release interlock: no campaign is claimed (or billed) until
  // the complete discovery-to-searchable pipeline passes certification.
  if (process.env.LI_V2_CERTIFIED_SEARCHABLE_IMPORT_ENABLED !== "true") {
    return { claimed:false, stopped:"searchable_import_certification_required" };
  }
  const { data, error } = await supabaseAdmin.rpc("li_v2_claim_campaign_run");
  if (error) throw error;
  if (!data) return { claimed:false };
  const run = data as Run;
  const provider = LOCATION_INTELLIGENCE_ADAPTERS.find(a => a.descriptor.id === "brave");
  if (!provider) throw new Error("campaign_brave_provider_missing");
  const { data: coverage, error: coverageError } = await supabaseAdmin
    .from("location_coverage_state")
    .select("market,area_key,location_kind,category,target_count,current_count")
    .gt("target_count",0)
    .order("priority_score",{ascending:false}).limit(10);
  if (coverageError) throw coverageError;
  const sourceLabel="LI V2 "+run.campaign_id+" "+run.id;
  const { data: priorBatches, error: priorError } = await supabaseAdmin.from("location_import_batches")
    .select("id").eq("source","li_v2_brave").eq("source_label",sourceLabel).limit(1);
  if(priorError) throw new Error("campaign_batch_lookup_failed");
  const {data: batch,error:batchError} = priorBatches?.length
    ? {data:priorBatches[0],error:null}
    : await supabaseAdmin.from("location_import_batches").insert({
      source:"li_v2_brave",source_label:sourceLabel,status:"staging",
      metadata:{campaign_id:run.campaign_id,run_id:run.id},
    }).select("id").single();
  if (batchError || !batch) throw new Error("campaign_batch_creation_failed");
  let processed=0, discovered=0, failed=0, staged=0;
  for (const [index,target] of ((coverage || []) as Coverage[]).entries()) {
    if (index < run.processed) continue;
    if (target.current_count >= target.target_count) {
      const {data: skipped, error: skipError} = await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",
        {p_run_id:run.id,p_processed:1,p_discovered:0,p_failed:0,p_status:"running"});
      if (skipError || skipped !== true) break;
      processed++;
      continue;
    }
    const {data:permitted,error:permissionError} = await supabaseAdmin
      .rpc("li_v2_campaign_run_permitted",{p_run_id:run.id});
    if (permissionError || permitted !== true) break;
    const identityQuery = `${target.category.replace(/_/g," ")} ${target.location_kind} ${target.area_key} New York`;
    // Fail closed: no paid discovery until Google's IDs-only set has been
    // checked against all live and staged TOH identities, even hidden rows.
    // This does not claim that Google IDs identify a complete business profile.
    const idGate = await discoverUnseenGooglePlaceIds(identityQuery);
    if (idGate.unseenIds.length === 0) {
      const {data:checkpoint,error:checkpointError} = await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",
        {p_run_id:run.id,p_processed:1,p_discovered:0,p_failed:0,p_status:"running"});
      if(checkpointError || checkpoint!==true) break;
      processed++;
      continue;
    }
    const query = `${target.category.replace(/_/g," ")} ${target.location_kind} ${target.area_key} ${target.market} official website`;
    let hit=0, miss=0;
    try {
      // A single paid, campaign-reserved provider request. No automatic publication:
      // candidates require identity resolution, dedupe, and quality review.
      const result = await provider.execute({
        capability:"web_context",purpose:"discovery",
        input:{query,count:5,acquisitionCampaignId:run.campaign_id,
          acquisitionEventKey:`li-v2-${run.id.replace(/-/g,"")}-${index}`},
      });
      const {data:stillAllowed,error:stillAllowedError}=await supabaseAdmin.rpc("li_v2_campaign_run_permitted",{p_run_id:run.id});
      if(stillAllowedError || stillAllowed!==true) break;
      const candidates = Array.isArray(result.data) ? result.data as Array<Record<string,unknown>> : [];
      for (const candidate of candidates.slice(0,5)) {
        const url=String(candidate.url || "").trim();
        const title=String(candidate.title || "").trim();
        if (!url.startsWith("https://") || !title) continue;
        const sourceId=createHash("sha256").update(url).digest("hex");
        // The database unique(source, source_id) constraint arbitrates concurrent
        // worker attempts. Read-before-write cannot prevent duplicate races.
        const {data:inserted,error:stageError}=await supabaseAdmin.from("location_import_staging").upsert({
          batch_id:batch.id,source:"li_v2_brave",source_id:sourceId,source_url:url,
          name:title,description:String(candidate.description||"").slice(0,1000),
          location_type:target.location_kind,primary_category:target.category,
          import_status:"staged",duplicate_status:"unchecked",quality_status:"needs_review",
          source_quality_status:"imported_unverified",import_confidence:"low",
          raw_payload:{campaign_id:run.campaign_id,run_id:run.id,market:target.market,area:target.area_key},
        },{onConflict:"source,source_id",ignoreDuplicates:true}).select("id");
        if(stageError) throw new Error("candidate_staging_failed:"+stageError.message);
        if(inserted?.length) staged++;

      }
      if(candidates.length){discovered+=candidates.length;hit=candidates.length;}
    } catch (e) {
      failed++; miss=1;
      // No retry is safe after a provider request may have been charged.
      const message = e instanceof Error ? e.message : "unknown_provider_or_staging_error";
      const {data: stopped, error: stopError} = await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",
        {p_run_id:run.id,p_processed:0,p_discovered:0,p_failed:1,p_status:"failed",p_error:message});
      if (stopError || stopped !== true) throw new Error("campaign_failure_checkpoint_not_recorded");
      return {claimed:true,runId:run.id,processed,staged,stopped:"manual_reconciliation_required"};
    }
    processed++;
    const {data:accepted,error:checkpointError} = await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",
      {p_run_id:run.id,p_processed:1,p_discovered:hit,p_failed:miss,p_status:"running"});
    // Operator pause/cancel won the lock; do not issue another request.
    if (checkpointError || accepted !== true) break;
    discovered=0;failed=0;
  }
  const {data:allowFinalization,error:finalizationError}=await supabaseAdmin.rpc("li_v2_campaign_run_permitted",{p_run_id:run.id});
  if(finalizationError || allowFinalization!==true) return {claimed:true,runId:run.id,processed,staged,stopped:"operator_command"};
  const dedupe=await dedupeStagedLocationsChunk({batchId:batch.id,limit:50});
  const {data:allowPublishing,error:publishingError}=await supabaseAdmin.rpc("li_v2_campaign_run_permitted",{p_run_id:run.id});
  if(publishingError || allowPublishing!==true) return {claimed:true,runId:run.id,processed,staged,dedupe,stopped:"operator_command"};
  const publishing=await publishReadyStagedLocations({batchId:batch.id,limit:20});
  if(publishing.errors.length) throw new Error("campaign_publishing_errors:"+publishing.errors.join(";"));
  const {data:recorded,error:recordError}=await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",{
    p_run_id:run.id,p_processed:0,p_discovered:0,p_failed:0,
    p_published:publishing.markedPublished,p_status:"running",
  });
  if(recordError || recorded!==true) throw new Error("campaign_publish_progress_not_recorded");
  const {data:permitted}=await supabaseAdmin.rpc("li_v2_campaign_run_permitted",{p_run_id:run.id});
  if (permitted === true) await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",
    {p_run_id:run.id,p_processed:0,p_discovered:0,p_failed:0,p_status:"completed"});
  return {claimed:true,runId:run.id,processed,staged,dedupe,publishing};
}
