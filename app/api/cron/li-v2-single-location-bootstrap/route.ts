import {bootstrapSuperiorityBurger} from "@/lib/location-intelligence/v2/single-location-bootstrap";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=240;
/** Explicitly opt-in and private-only; no browser/user-facing invocation. */
export async function POST(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret || request.headers.get("authorization")!==`Bearer ${secret}`)
    return Response.json({ok:false,error:"unauthorized"},{status:401});
  if(process.env.PLATFORM_RUNTIME_PROVIDER!=="aws-background" ||
     request.headers.get("x-toh-aws-internal")!=="managed-dispatch")
    return Response.json({ok:false,error:"private_aws_only"},{status:403});
  if(process.env.LI_V2_SINGLE_LOCATION_BOOTSTRAP_ENABLED!=="true")
    return Response.json({ok:false,error:"single_location_bootstrap_not_enabled"},{status:403});
  try{
    const data=await request.json().catch(()=>({}));
    if(data?.confirmation!=="superiority-burger-119-avenue-a")
      return Response.json({ok:false,error:"explicit_business_confirmation_required"},{status:400});
    const result=await bootstrapSuperiorityBurger({dryRun:data.dryRun===true});
    return Response.json(result,{status:result.ok?200:422});
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:"bootstrap_failed"},{status:500});
  }
}
