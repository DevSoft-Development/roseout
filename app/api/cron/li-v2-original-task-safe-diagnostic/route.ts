import "server-only";
import {supabaseAdmin} from "@/lib/supabase-admin";
import {getMapsStandardTask} from "@/lib/location-intelligence/v2/dataforseo-maps-standard";
import {websiteLeadFromMapsItem} from "@/lib/location-intelligence/v2/maps-independent-resolver";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const RUN_ID="f575c139-1e94-4ca9-9916-a9f6306f5f36";
const TASK_ID="10162316-2703-0066-0000-adb4592275cf";
/** Diagnostic only: reads purchased task; never verifies, stages, or publishes candidates. */
export async function POST(request:Request) {
 const token=String(process.env.CRON_SECRET||"");
 if(!token||request.headers.get("authorization")!==`Bearer ${token}`)
   return Response.json({ok:false,error:"unauthorized"},{status:401});
 if(process.env.PLATFORM_RUNTIME_PROVIDER!=="aws-background"||
   request.headers.get("x-toh-aws-internal")!=="managed-dispatch")
   return Response.json({ok:false,error:"private_background_only"},{status:403});
 try{
   const {data,error}=await supabaseAdmin.rpc("li_v2_existing_pilot_replay_snapshot",{p_run_id:RUN_ID});
   if(error|| (data as {task_id?:unknown}|null)?.task_id!==TASK_ID)
     return Response.json({ok:false,error:"original_task_identity_not_verified"},{status:409});
   const task=await getMapsStandardTask(TASK_ID);
   if(task.status!=="ready")return Response.json({ok:true,readonly:true,providerStatus:task.status,candidates:0,noPurchase:true,replayAuthorized:false});
   const items=task.items.slice(0,50);
   const seen=new Set<string>();
   let missingOfficialWebsite=0,duplicateWebsiteLeads=0;
   for(const item of items){
     const origin=websiteLeadFromMapsItem(item);
     if(!origin){missingOfficialWebsite++;continue;}
     if(seen.has(origin)){duplicateWebsiteLeads++;continue;}
     seen.add(origin);
   }
   // No raw licensed provider fields, candidate addresses, or website origins enter logs.
   return Response.json({ok:true,readonly:true,noPurchase:true,replayAuthorized:false,
     originalTaskVerified:true,providerStatus:"ready",candidates:items.length,
     uniqueWebsiteLeads:seen.size,missingOfficialWebsite,duplicateWebsiteLeads,
     stagingAttempted:false,publicationAttempted:false});
 }catch{return Response.json({ok:false,error:"diagnostic_unavailable"},{status:503});}
}
