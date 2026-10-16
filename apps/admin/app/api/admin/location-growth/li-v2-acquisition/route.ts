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
 const {data,error}=await db.rpc("admin_li_v2_acquisition_snapshot",{p_campaign_id:CAMPAIGN});
 if(error)return unavailable();
 return NextResponse.json({ok:true,...data});

}

export async function POST(req:Request){
 await requireAdminRole(["superadmin"]);
 if(process.env.PLATFORM_RUNTIME_PROVIDER!=="aws-admin")return unavailable();
 const body=await req.json().catch(()=>null);
 const action=body?.action;
 if(!["start","pause","resume","cancel","recover","reverify"].includes(action) ||
  body?.confirmation!==CAMPAIGN)return NextResponse.json({ok:false,error:"invalid_or_unconfirmed_command"},{status:400});
 const db=getAdminDatabaseClient();
 if(action==="recover"||action==="reverify"){
  if(!/^[0-9a-f-]{36}$/i.test(String(body?.runId||"")))
   return NextResponse.json({ok:false,error:"invalid_run_id"},{status:400});
  const {data,error}=await db.rpc(action==="recover"?"admin_li_v2_recover_paid_task":"admin_li_v2_reverify_existing_paid_task",{p_run_id:body.runId});
  if(error)return NextResponse.json({ok:false,error:error.message},{status:409});
  return NextResponse.json({ok:data===true,action,runId:body.runId,noProviderPurchase:true});
 }
 const {data,error}=await db.rpc("admin_li_v2_import_command",{p_campaign_id:CAMPAIGN,p_action:action});
 if(error)return NextResponse.json({ok:false,error:error.message},{status:409});
 return NextResponse.json({ok:true,action,runId:data});
}
