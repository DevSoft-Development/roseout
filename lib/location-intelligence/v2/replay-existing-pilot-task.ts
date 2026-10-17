import "server-only";
import {supabaseAdmin} from "@/lib/supabase-admin";
import {getMapsStandardTask} from "./dataforseo-maps-standard";
import {resolveQueuedMapsToIndependentProfiles} from "./maps-independent-resolver";

/**
 * Reuse only the existing purchased READY task. No queue submission,
 * campaign claiming, campaign checkpointing, or recovery counter updates.
 */
export async function replayExistingPilotTask() {
  const runId="f575c139-1e94-4ca9-9916-a9f6306f5f36";
  const campaignId="li-v2-pilot-001";
  const {data:run,error:runError}=await supabaseAdmin
    .schema("private").from("li_v2_campaign_import_runs")
    .select("id,campaign_id,status,processed,recovery_count,requested_action")
    .eq("id",runId).maybeSingle();
  if(runError||!run||run.campaign_id!==campaignId||
     run.processed!==0||run.requested_action!=="run"||
     !["failed","queued"].includes(run.status))
    throw new Error("existing_pilot_run_not_eligible");
  const {data:rows,error:queueError}=await supabaseAdmin
    .schema("private").from("li_v2_maps_queue")
    .select("target_index,status,task_id")
    .eq("campaign_run_id",runId);
  if(queueError||!rows||rows.length!==1||rows[0].target_index!==0||
     rows[0].status!=="ready"||!rows[0].task_id)
    throw new Error("existing_paid_ready_task_required");
  const fetched=await getMapsStandardTask(rows[0].task_id);
  if(fetched.status!=="ready")return {status:"provider_task_pending",staged:0};
  const outcome=await resolveQueuedMapsToIndependentProfiles({
    runId,campaignId,items:fetched.items,maxGooglePhotoLookups:0
  });
  return {status:"replayed_without_discovery_purchase",runId,
    inspected:outcome.inspected,staged:outcome.staged,
    photoPendingOrBlocked:outcome.photoBlocked,reasonCounts:outcome.reasons,
    publishedLocationIds:outcome.finalizations.flatMap(f=>f.publishedLocationIds),
    searchV3RetrievalCertified:false};
}
