import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { discoverUnseenGooglePlaceIds } from "@/lib/location-intelligence/v2/acquisition-identity-gate";
import { advanceMapsQueue, submitApprovedMapsQueue } from "@/lib/location-intelligence/v2/maps-queue-runner";
import { resolveQueuedMapsToIndependentProfiles } from "@/lib/location-intelligence/v2/maps-independent-resolver";
import { advanceConsumerChecks, registerConsumerChecks } from "@/lib/location-intelligence/v2/consumer-retrieval-certifier";

type Run = {id:string;campaign_id:string;processed:number};
type Coverage={market:string;area_key:string;location_kind:string;category:string;target_count:number;current_count:number};

async function checkpoint(runId:string, processed:number, status:"running"|"failed"="running",errorMessage?:string) {
 const {data,error}=await supabaseAdmin.rpc("li_v2_campaign_run_checkpoint",{
   p_run_id:runId,p_processed:processed,p_discovered:0,p_failed:status==="failed"?1:0,
   p_status:status,p_error:errorMessage||null,
 });
 if(error||data!==true)throw new Error("campaign_checkpoint_failed");
}
async function reconcilePublished(runId:string) {
 const {error}=await supabaseAdmin.rpc("li_v2_reconcile_campaign_published",{p_run_id:runId});
 if(error)console.error("li_v2_publication_counter_reconciliation_failed",error.message);
}
async function yieldQueuedRun(runId:string) {
 const {data,error}=await supabaseAdmin.rpc("li_v2_maps_campaign_yield",{p_run_id:runId});
 if(error||data!==true)throw new Error("maps_campaign_yield_failed");
}

/** One bounded step per invocation. Paid work only after both certification flags and DB caps. */
export async function processQueuedAcquisitionCampaign() {
 // First paid evidence cannot be produced if it requires prior paid evidence.
 // Bootstrap is separately authorized, processes at most target zero, and never
 // asserts that full searchable-import or independent-source certification passed.
 // Independent source certification still gates unattended paid acquisition.
 // Search certification is a separate monitoring signal, not an import prerequisite.
 const acquisitionEnabled=process.env.LI_V2_INDEPENDENT_PROFILE_SOURCE_CERTIFIED==="true";
 const bootstrap=process.env.LI_V2_ONE_TARGET_BOOTSTRAP_ENABLED==="true" && !acquisitionEnabled;
 if(!acquisitionEnabled&&!bootstrap)
   return {claimed:false,stopped:"independent_source_certification_required"};
 const {data,error}=await supabaseAdmin.rpc("li_v2_claim_campaign_run");
 if(error)throw error;
 if(!data)return {claimed:false};
 const run=data as Run;
 const {data:coverage,error:coverageError}=await supabaseAdmin.from("location_coverage_state")
   .select("market,area_key,location_kind,category,target_count,current_count")
   .gt("target_count",0).order("priority_score",{ascending:false}).limit(10);
 if(coverageError)throw coverageError;
 for(const [index,target] of ((coverage||[]) as Coverage[]).entries()){
   // A bootstrap must never purchase a second coverage target, even if the
   // scheduled worker is invoked again after the first has completed.
   if(bootstrap && index>0)
     return {claimed:true,runId:run.id,stopped:"bootstrap_one_target_limit",
       processed:run.processed};
   if(index<run.processed)continue;
   const {data:permitted,error:permissionError}=await supabaseAdmin.rpc(
     "li_v2_campaign_run_permitted",{p_run_id:run.id});
   if(permissionError||permitted!==true)
     return {claimed:true,runId:run.id,stopped:"operator_command"};
   const {data:queuedTargets,error:queuedError}=await supabaseAdmin.rpc("li_v2_maps_queue_snapshot",{p_run_id:run.id});
   if(queuedError)throw queuedError;
   const existing=(queuedTargets as {target_index:number;status:string}[]).find(q=>q.target_index===index);
   if(target.current_count>=target.target_count&&!existing){
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
   if(queue.status==="reviewed"){
     await reconcilePublished(run.id);
     // Crash-safe: reviewing the paid task and checkpointing the campaign are
     // separate operations. Finalize an already-reviewed target without re-buying.
     await checkpoint(run.id,1);
     continue;
   }
   if(queue.status==="ready"){
     // Publication is the import boundary. Consumer retrieval and Search V3
     // verification remain best-effort, asynchronous quality signals.
     // Never repurchase a ready paid task or quarantine the whole campaign
     // merely because a published location is not yet returned by search.
     let checks:Awaited<ReturnType<typeof advanceConsumerChecks>>|null=null;
     try{
       checks=await advanceConsumerChecks(run.id,index);
     }catch(error){
       // Do not repeat profile resolution without knowing durable ledger state.
       await yieldQueuedRun(run.id);
       return {claimed:true,runId:run.id,stopped:"consumer_monitor_unavailable",
         authenticatedSearchV3Certified:false};
     }
     if(checks?.state==="unregistered"){
       const resolved=await resolveQueuedMapsToIndependentProfiles({
         runId:run.id,campaignId:run.campaign_id,items:queue.items||[],
         maxGooglePhotoLookups:bootstrap?1:50,
       });
       const ids=[...new Set(resolved.finalizations.flatMap(batch=>batch.publishedLocationIds))];
       if(!ids.length){
         // Do not certify or advance a target without a published location.
         const reason=resolved.staged>0?"photo_pending_or_unpublished_locations":"no_published_locations_to_certify";
         await checkpoint(run.id,0,"failed",reason);
         return {claimed:true,runId:run.id,stopped:reason,
           inspected:resolved.inspected,staged:resolved.staged,photoBlocked:resolved.photoBlocked,
           authenticatedSearchV3Certified:false};
       }
       try{
         await registerConsumerChecks(run.id,index,ids);
         checks=await advanceConsumerChecks(run.id,index);
       }catch(error){
         // Record remains published; a monitor outage cannot fail acquisition.
         console.error("li_v2_consumer_monitor_registration_failed",error);
       }
     }
     // Certification ledger persists independently; pending and quarantined
     // results remain visible for repair. No Search V3 promotion claims.
     const {data:transition,error:transitionError}=await supabaseAdmin.rpc("li_v2_maps_queue_transition",{
       p_run_id:run.id,p_index:index,p_query:query,p_from:"ready",p_to:"reviewed"
     });
     if(transitionError||transition?.status!=="reviewed")
       throw new Error("certified_maps_queue_review_transition_failed");
     await checkpoint(run.id,1);
     await reconcilePublished(run.id);
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
