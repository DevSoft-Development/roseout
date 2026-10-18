import { processQueuedAcquisitionCampaign } from "@/lib/location-intelligence/v2/campaign-worker";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=280;
export async function GET(request:Request) {
  const token=String(process.env.CRON_SECRET||"");
  if (!token || request.headers.get("authorization")!==`Bearer ${token}`) return Response.json({ok:false},{status:401});
  if (process.env.PLATFORM_RUNTIME_PROVIDER!=="aws-background" ||
      request.headers.get("x-toh-aws-internal")!=="managed-dispatch") return Response.json({ok:false,error:"private_background_only"},{status:403});
  try {
    const result=await processQueuedAcquisitionCampaign();
    const category=!result.claimed
      ? (result.stopped==="searchable_import_certification_required" ? "certification_blocked" : "no_run_claimed")
      : result.queueStatus==="pending" || result.stopped==="awaiting_consumer_indexing"
        ? "yielded"
        : result.stopped ? "stopped" : "claimed";
    console.info(JSON.stringify({
      event:"li_v2_campaign_worker_outcome",category,claimed:result.claimed===true,
      runId:result.runId||null,stopped:result.stopped||null,
      queueStatus:result.queueStatus||null,
      processed:result.processed??null,
      inspected:result.inspected??null,
      staged:result.staged??null,
      photoBlocked:result.photoBlocked??null,
    }));
    return Response.json({ok:true,result});
  } catch(e) {
    const error=e instanceof Error?e.message:"worker_error";
    console.error(JSON.stringify({event:"li_v2_campaign_worker_outcome",category:"failed",error}));
    return Response.json({ok:false,error},{status:500});
  }
}
export const POST = GET;
