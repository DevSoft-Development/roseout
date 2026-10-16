import { NextResponse } from "next/server";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const CAMPAIGN="li-v2-pilot-001";
const unavailable=()=>NextResponse.json({ok:false,error:"acquisition_control_unavailable"},{status:503});

export async function GET(){
 await requireAdminRole(["superadmin","admin"]);
 if(process.env.PLATFORM_RUNTIME_PROVIDER!=="aws-admin")return unavailable();
 const db=getAdminDatabaseClient();
 const [runs,queue,usage,audit]=await Promise.all([
  db.rpc("admin_li_v2_import_runs"),
  db.rpc("li_v2_admin_maps_queue"),
  db.from("location_acquisition_usage").select("provider,status,estimated_usd,actual_usd,occurred_at").eq("campaign_id",CAMPAIGN).limit(100),
  db.from("li_v2_candidate_audit").select("run_id,status,reason,website_origin,recorded_at").order("recorded_at",{ascending:false}).limit(100),
 ]);
 if(runs.error||queue.error||usage.error||audit.error)return unavailable();
 return NextResponse.json({ok:true,campaignId:CAMPAIGN,runs:runs.data,queue:queue.data,usage:usage.data,candidates:audit.data});
}

export async function POST(req:Request){
 await requireAdminRole(["superadmin"]);
 if(process.env.PLATFORM_RUNTIME_PROVIDER!=="aws-admin")return unavailable();
 const body=await req.json().catch(()=>null);
 const action=body?.action;
 if(!["start","pause","resume","cancel","recover"].includes(action) ||
  body?.confirmation!==CAMPAIGN)return NextResponse.json({ok:false,error:"invalid_or_unconfirmed_command"},{status:400});
 const db=getAdminDatabaseClient();
 if(action==="recover"){
  if(!/^[0-9a-f-]{36}$/i.test(String(body?.runId||"")))
   return NextResponse.json({ok:false,error:"invalid_run_id"},{status:400});
  const {data,error}=await db.rpc("admin_li_v2_recover_paid_task",{p_run_id:body.runId});
  if(error)return NextResponse.json({ok:false,error:error.message},{status:409});
  return NextResponse.json({ok:data===true,action,runId:body.runId,noProviderPurchase:true});
 }
 const {data,error}=await db.rpc("admin_li_v2_import_command",{p_campaign_id:CAMPAIGN,p_action:action});
 if(error)return NextResponse.json({ok:false,error:error.message},{status:409});
 return NextResponse.json({ok:true,action,runId:data});
}
