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
  // The private schema is intentionally NOT exposed over PostgREST.
  // An explicitly scoped, service-role-only RPC verifies both campaign and ready task.
  const {data:snapshot,error:snapshotError}=await supabaseAdmin.rpc(
    "li_v2_existing_pilot_replay_snapshot",{p_run_id:runId}
  );
  if(snapshotError)throw new Error("existing_pilot_snapshot_failed:"+snapshotError.message);
  const taskId=(snapshot as {task_id?:unknown}|null)?.task_id;
  if(typeof taskId!=="string"||!taskId)throw new Error("existing_paid_ready_task_required");
  const campaignId="li-v2-pilot-001";
  const fetched=await getMapsStandardTask(taskId);
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
