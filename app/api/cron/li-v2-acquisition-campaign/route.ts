import { processQueuedAcquisitionCampaign } from "@/lib/location-intelligence/v2/campaign-worker";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=280;
export async function GET(request:Request) {
  const token=String(process.env.CRON_SECRET||"");
  if (!token || request.headers.get("authorization")!==`Bearer ${token}`) return Response.json({ok:false},{status:401});
  if (process.env.PLATFORM_RUNTIME_PROVIDER!=="aws-background" ||
      request.headers.get("x-toh-aws-internal")!=="managed-dispatch") return Response.json({ok:false,error:"private_background_only"},{status:403});
  try { return Response.json({ok:true,result:await processQueuedAcquisitionCampaign()}); }
  catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:"worker_error"},{status:500});}
}

export const POST = GET;
