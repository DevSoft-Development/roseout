import { NextResponse } from "next/server";
import { authenticatePosDeviceCredential } from "@/lib/pos/device-command-service";
import { requireSignaturePlusAccess } from "@/lib/pos/access";
import {
  buildSignaturePlusSplit,
  getSignaturePlusBootstrap,
  getSignaturePlusInventory,
  getSignaturePlusReport,
  listSignaturePlusKds,
  moveOrMergeSignaturePlusTable,
  setSignaturePlusCourseState,
  transferSignaturePlusServer,
} from "@/lib/pos/signature-plus/service";

export const dynamic="force-dynamic";

function bearer(request:Request){
  const value=request.headers.get("authorization")||"";
  return value.toLowerCase().startsWith("bearer ")?value.slice(7).trim():"";
}
async function auth(request:Request){
  return authenticatePosDeviceCredential({
    deviceId:String(request.headers.get("x-pos-device-id")||""),
    credential:bearer(request),
  });
}
function statusFor(message:string){
  if(/unauthorized|missing/.test(message)) return 401;
  if(/not_found/.test(message)) return 404;
  if(/signature_plus_required/.test(message)) return 403;
  if(/invalid|mismatch|not_fireable|has_open_check/.test(message)) return 400;
  return 500;
}

export async function GET(request:Request){
  try{
    const device=await auth(request);
    await requireSignaturePlusAccess(device.locationId);
    const url=new URL(request.url);
    const view=String(url.searchParams.get("view")||"bootstrap");
    if(view==="kds"){
      const kds=await listSignaturePlusKds({locationId:device.locationId,station:url.searchParams.get("station")});
      return NextResponse.json({ok:true,kds},{headers:{"Cache-Control":"no-store"}});
    }
    if(view==="inventory"){
      const inventory=await getSignaturePlusInventory(device.locationId);
      return NextResponse.json({ok:true,inventory},{headers:{"Cache-Control":"no-store"}});
    }
    if(view==="report"){
      const report=await getSignaturePlusReport({
        locationId:device.locationId,from:url.searchParams.get("from"),to:url.searchParams.get("to"),
      });
      return NextResponse.json({ok:true,report},{headers:{"Cache-Control":"no-store"}});
    }
    const data=await getSignaturePlusBootstrap(device.locationId);
    return NextResponse.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"pos_signature_plus_failed";
    return NextResponse.json({ok:false,error:message},{status:statusFor(message),headers:{"Cache-Control":"no-store"}});
  }
}

export async function POST(request:Request){
  try{
    const device=await auth(request);
    await requireSignaturePlusAccess(device.locationId);
    const body=await request.json().catch(()=>null) as any;
    if(!body||typeof body!=="object") throw new Error("pos_signature_invalid_payload");
    const action=String(body.action||"");
    let result:any;
    if(action==="course_state"){
      result=await setSignaturePlusCourseState({
        locationId:device.locationId,orderId:String(body.orderId||""),action:String(body.courseAction||"") as any,
      });
    }else if(action==="table_move"||action==="table_merge"){
      result=await moveOrMergeSignaturePlusTable({
        locationId:device.locationId,checkId:String(body.checkId||""),
        targetLayoutItemId:String(body.targetLayoutItemId||""),
        mode:action==="table_move"?"move":"merge",
      });
    }else if(action==="transfer_server"){
      result=await transferSignaturePlusServer({
        locationId:device.locationId,checkId:String(body.checkId||""),staffProfileId:String(body.staffProfileId||""),
      });
    }else if(action==="split"){
      result=await buildSignaturePlusSplit({
        locationId:device.locationId,checkId:String(body.checkId||""),
        mode:String(body.mode||"by_guest") as any,parts:body.parts==null?undefined:Number(body.parts),
        custom:body.custom&&typeof body.custom==="object"?body.custom:undefined,
      });
    }else{
      throw new Error("pos_signature_invalid_action");
    }
    return NextResponse.json({ok:true,result},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"pos_signature_plus_failed";
    return NextResponse.json({ok:false,error:message},{status:statusFor(message),headers:{"Cache-Control":"no-store"}});
  }
}
