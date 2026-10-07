import { NextResponse } from "next/server";
import { authenticatePosDeviceCredential } from "@/lib/pos/device-command-service";
import {
  addPosTableItem,
  getPosTableCheckWorkspace,
  getPosTableServiceBootstrap,
  openOrResumePosTableCheck,
  sendPosTableCourses,
  updatePosTableGuestCount,
} from "@/lib/pos/table-service/service";

export const dynamic="force-dynamic";

function bearer(request:Request){
  const value=request.headers.get("authorization")||"";
  return value.toLowerCase().startsWith("bearer ")?value.slice(7).trim():"";
}
async function authenticate(request:Request){
  return authenticatePosDeviceCredential({
    deviceId:String(request.headers.get("x-pos-device-id")||""),
    credential:bearer(request),
  });
}
function statusFor(message:string){
  if(/unauthorized|missing/.test(message)) return 401;
  if(/not_found/.test(message)) return 404;
  if(/invalid|unavailable|not_open|sold_out|modifier/.test(message)) return 400;
  return 500;
}

export async function GET(request:Request){
  try{
    const device=await authenticate(request);
    const url=new URL(request.url);
    const checkId=String(url.searchParams.get("checkId")||"").trim();
    if(checkId){
      const workspace=await getPosTableCheckWorkspace(device.locationId,checkId);
      return NextResponse.json({ok:true,workspace},{headers:{"Cache-Control":"no-store"}});
    }
    const bootstrap=await getPosTableServiceBootstrap(device.locationId);
    return NextResponse.json({ok:true,...bootstrap},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"pos_table_service_failed";
    return NextResponse.json({ok:false,error:message},{status:statusFor(message),headers:{"Cache-Control":"no-store"}});
  }
}

export async function POST(request:Request){
  try{
    const device=await authenticate(request);
    const body=await request.json().catch(()=>null) as any;
    if(!body||typeof body!=="object") throw new Error("pos_table_invalid_payload");
    const action=String(body.action||"");
    let workspace;
    if(action==="open_check"){
      workspace=await openOrResumePosTableCheck({
        locationId:device.locationId,
        layoutItemId:String(body.layoutItemId||""),
        guestCount:body.guestCount==null?null:Number(body.guestCount),
      });
    }else if(action==="update_guest_count"){
      workspace=await updatePosTableGuestCount({
        locationId:device.locationId,
        checkId:String(body.checkId||""),
        guestCount:Number(body.guestCount||1),
      });
    }else if(action==="add_item"){
      workspace=await addPosTableItem({
        locationId:device.locationId,
        checkId:String(body.checkId||""),
        catalogItemId:String(body.catalogItemId||""),
        seatNumbers:Array.isArray(body.seatNumbers)?body.seatNumbers.map(Number):null,
        course:body.course?String(body.course):null,
        quantity:Number(body.quantity||1),
        modifierIds:Array.isArray(body.modifierIds)?body.modifierIds.map(String):[],
        notes:body.notes?String(body.notes):null,
      });
    }else if(action==="send_courses"){
      workspace=await sendPosTableCourses({
        locationId:device.locationId,
        checkId:String(body.checkId||""),
        courses:Array.isArray(body.courses)?body.courses.map(String):null,
      });
    }else{
      throw new Error("pos_table_invalid_action");
    }
    return NextResponse.json({ok:true,workspace},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"pos_table_service_failed";
    return NextResponse.json({ok:false,error:message},{status:statusFor(message),headers:{"Cache-Control":"no-store"}});
  }
}
