import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { discoverUnseenGooglePlaceIds } from "@/lib/location-intelligence/v2/acquisition-identity-gate";
import { advanceMapsQueue, submitApprovedMapsQueue } from "@/lib/location-intelligence/v2/maps-queue-runner";
import { resolveQueuedMapsToIndependentProfiles } from "@/lib/location-intelligence/v2/maps-independent-resolver";

type Run = {id:string;campaign_id:string;processed:number};
type Coverage={market:string;area_key:string;location_kind:string;category:string;target_count:number;current_count:number};

async function checkpoint(runId:string, processed:number, status:"running"|"failed"="running",errorMessage?:string) {
 const {data,error}=await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",{
   p_run_id:runId,p_processed:processed,p_discovered:0,p_failed:status==="failed"?1:0,
   p_status:status,p_error:errorMessage||null,
 });
 if(error||data!==true)throw new Error("campaign_checkpoint_failed");
}
async function yieldQueuedRun(runId:string) {
 const {data,error}=await supabaseAdmin.rpc("li_v2_maps_campaign_yield",{p_run_id:runId});
 if(error||data!==true)throw new Error("maps_campaign_yield_failed");
}

/** One bounded step per invocation. Paid work only after both certification flags and DB caps. */
export async function processQueuedAcquisitionCampaign() {
 if(process.env.LI_V2_CERTIFIED_SEARCHABLE_IMPORT_ENABLED!=="true" ||
    process.env.LI_V2_INDEPENDENT_PROFILE_SOURCE_CERTIFIED!=="true")
   return {claimed:false,stopped:"searchable_import_certification_required"};
 const {data,error}=await supabaseAdmin.rpc("li_v2_claim_campaign_run");
 if(error)throw error;
 if(!data)return {claimed:false};
 const run=data as Run;
 const {data:coverage,error:coverageError}=await supabaseAdmin.from("location_coverage_state")
   .select("market,area_key,location_kind,category,target_count,current_count")
   .gt("target_count",0).order("priority_score",{ascending:false}).limit(10);
 if(coverageError)throw coverageError;
 for(const [index,target] of ((coverage||[]) as Coverage[]).entries()){
   if(index<run.processed)continue;
   const {data:permitted,error:permissionError}=await supabaseAdmin.rpc(
     "li_v2_campaign_run_permitted",{p_run_id:run.id});
   if(permissionError||permitted!==true)
     return {claimed:true,runId:run.id,stopped:"operator_command"};
   if(target.current_count>=target.target_count){
     await checkpoint(run.id,1);
     continue;
   }
   const query=`${target.category.replace(/_/g," ")} ${target.location_kind} ${target.area_key} ${target.market}`;
   const queue=await advanceMapsQueue(run.id,index,query);
   if(queue.status==="prepared"){
     const idGate=await discoverUnseenGooglePlaceIds(query);
     if(idGate.unseenIds.length===0){
       await checkpoint(run.id,1);
       continue;
     }
     const submission=await submitApprovedMapsQueue({
       runId:run.id,campaignId:run.campaign_id,targetIndex:index,query,
     });
     if(submission.status==="pending")await yieldQueuedRun(run.id);
     else await checkpoint(run.id,0,"failed","maps_standard_submission_uncertain_manual_reconciliation");
     return {claimed:true,runId:run.id,queueStatus:submission.status};
   }
   if(queue.status==="pending"){
     await yieldQueuedRun(run.id);
     return {claimed:true,runId:run.id,queueStatus:"pending"};
   }
   if(queue.status==="ready"){
     // Maps content is a discovery lead only; official evidence and rights grants
     // are separately verified before any LI V2 profile is staged/published.
     const resolved=await resolveQueuedMapsToIndependentProfiles({
       runId:run.id,campaignId:run.campaign_id,items:queue.items||[],
     });
     if(resolved.staged===0){
       await checkpoint(run.id,0,"failed","no_rights_verified_publishable_candidates");
       return {claimed:true,runId:run.id,stopped:"no_rights_verified_publishable_candidates",
         inspected:resolved.inspected,photoBlocked:resolved.photoBlocked};
     }
     const indexed=resolved.finalizations.some(batch=>batch.readyLocationIds.length>0 && batch.searchV3RetrievalCertified);
     if(!indexed){
       // A new location cannot pass authenticated Search V3 retrieval until it
       // has actually been imported and indexed. Preserve the paid task and
       // staged work; pause instead of incorrectly classifying it as failed.
       // A human must certify the new IDs before resuming paid acquisition.
       const {error:pauseError}=await supabaseAdmin.rpc("admin_li_v2_import_command",{
         p_campaign_id:run.campaign_id,p_action:"pause",
       });
       if(pauseError)throw new Error("campaign_certification_pause_failed:"+pauseError.message);
       return {claimed:true,runId:run.id,staged:resolved.staged,
         stopped:"awaiting_search_v3_live_retrieval_certification",
         reviewRequired:true};
     }
     await checkpoint(run.id,1);
     continue;
   }
   await checkpoint(run.id,0,"failed","maps_queue_manual_reconciliation_required");
   return {claimed:true,runId:run.id,stopped:"maps_queue_manual_reconciliation_required"};
 }
 const {data:done,error:doneError}=await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",{
   p_run_id:run.id,p_processed:0,p_discovered:0,p_failed:0,p_status:"completed",
 });
 if(doneError||done!==true)throw new Error("campaign_completion_checkpoint_failed");
 return {claimed:true,runId:run.id,processed:run.processed,stopped:"no_additional_coverage_targets"};
}
