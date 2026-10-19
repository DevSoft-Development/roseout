import { executeReservedInitialReview, collectInitialReviewSample, dispatchOperatorReservedInitialReviews } from "@/lib/location-intelligence/v2/initial-review-staging";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
/** Explicitly dispatched private AWS job only; never called by scheduled maintenance. */
export async function POST(request:Request){
  const secret=String(process.env.CRON_SECRET||"").trim();
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)
    return Response.json({ok:false,error:"unauthorized"},{status:401});
  if(process.env.PLATFORM_RUNTIME_PROVIDER!=="aws-background" ||
    request.headers.get("x-toh-aws-internal")!=="managed-dispatch")
    return Response.json({ok:false,error:"private_runtime_only"},{status:403});
  if(process.env.LI_V2_INITIAL_REVIEW_EXECUTION_ENABLED!=="true")
    return Response.json({ok:false,error:"initial_review_execution_disabled"},{status:409});
  const data=await request.json().catch(()=>null) as {stageId?:unknown;ledgerId?:unknown;action?:unknown}|null;
  if(data?.action==="dispatch"){
    try{return Response.json({ok:true,results:await dispatchOperatorReservedInitialReviews(10)});}
    catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"dispatch_failed"},{status:409});}
  }
  const stageId=String(data?.stageId||""),ledgerId=String(data?.ledgerId||"");
  if(!/^[0-9a-f-]{36}$/i.test(stageId)||!/^[0-9a-f-]{36}$/i.test(ledgerId)||
    !["submit","collect"].includes(String(data?.action||"")))
    return Response.json({ok:false,error:"invalid_review_job"},{status:400});
  try{
    const result=data?.action==="submit"
      ?await executeReservedInitialReview({stageId,ledgerId})
      :await collectInitialReviewSample({stageId,ledgerId});
    return Response.json({ok:true,result});
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:"review_job_failed"},{status:409});
  }
}
