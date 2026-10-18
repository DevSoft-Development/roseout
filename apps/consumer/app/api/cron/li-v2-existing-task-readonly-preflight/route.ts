import "server-only";
import {supabaseAdmin} from "@/lib/supabase-admin";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const RUN_ID="f575c139-1e94-4ca9-9916-a9f6306f5f36";
const EXPECTED_TASK_ID="10162316-2703-0066-0000-adb4592275cf";

/** Read-only production preflight. Never fetches the provider or stages candidates. */
export async function POST(request:Request) {
  const token=process.env.CRON_SECRET;
  if(!token||request.headers.get("authorization")!==`Bearer ${token}`)
    return Response.json({ok:false,error:"unauthorized"},{status:401});
  if(process.env.PLATFORM_RUNTIME_PROVIDER!=="aws-background"||
     request.headers.get("x-toh-aws-internal")!=="managed-dispatch")
    return Response.json({ok:false,error:"private_background_only"},{status:403});
  const {data:snapshot,error:snapshotError}=await supabaseAdmin.rpc(
    "li_v2_existing_pilot_replay_snapshot",{p_run_id:RUN_ID});
  if(snapshotError)return Response.json({ok:false,error:"snapshot_unavailable"},{status:503});
  const taskId=(snapshot as {task_id?:unknown}|null)?.task_id;
  if(taskId!==EXPECTED_TASK_ID)
    return Response.json({ok:false,error:"original_paid_task_mismatch"},{status:409});
  const {data,error}=await supabaseAdmin.from("li_v2_candidate_audit")
    .select("status,reason").eq("run_id",RUN_ID).limit(1000);
  if(error)return Response.json({ok:false,error:"audit_unavailable"},{status:503});
  const counts:Record<string,number>={};
  const reasons:Record<string,number>={};
  for(const row of data||[]){
    const status=String(row.status||"unknown"),reason=String(row.reason||"unknown");
    counts[status]=(counts[status]||0)+1;
    reasons[reason]=(reasons[reason]||0)+1;
  }
  return Response.json({ok:true,readonly:true,noProviderFetch:true,noNewPurchase:true,
    runId:RUN_ID,originalTaskMatches:true,auditRecordCount:(data||[]).length,
    statusCounts:counts,reasonCounts:reasons,replayAuthorized:false,
    candidatesCertified:false});
}
