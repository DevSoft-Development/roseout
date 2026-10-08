import { NextResponse } from "next/server";
import { authenticatePosDeviceCredential } from "@/lib/pos/device-command-service";
import { requirePosAccess } from "@/lib/pos/access";
import {
  applyPosCheckDiscount,
  closePosCashDrawerSession,
  getPosManagerOperations,
  openPosCashDrawerSession,
  recordPosCashTender,
  refundPosTender,
  voidPosOrderItem,
} from "@/lib/pos/payments/manager-service";

export const dynamic="force-dynamic";

function bearer(request:Request){
  const value=request.headers.get("authorization")||"";
  return value.toLowerCase().startsWith("bearer ")?value.slice(7).trim():"";
}
async function auth(request:Request){
  const device=await authenticatePosDeviceCredential({
    deviceId:String(request.headers.get("x-pos-device-id")||""),
    credential:bearer(request),
  });
  await requirePosAccess(device.locationId);
  return device;
}
function statusFor(message:string){
  if(/unauthorized|missing/.test(message)) return 401;
  if(/not_found/.test(message)) return 404;
  if(/approval_required|approver_not_found/.test(message)) return 403;
  if(/not_payable|already_paid|not_refundable|exceeds_available|session_closed/.test(message)) return 409;
  if(/invalid|insufficient|required/.test(message)) return 400;
  if(message.startsWith("operational_shard_")) return 503;
  return 500;
}

export async function GET(request:Request){
  try{
    const device=await auth(request);
    const operations=await getPosManagerOperations(device.locationId);
    return NextResponse.json({ok:true,operations},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"pos_manager_failed";
    return NextResponse.json({ok:false,error:message},{status:statusFor(message),headers:{"Cache-Control":"no-store"}});
  }
}

export async function POST(request:Request){
  try{
    const device=await auth(request);
    const body=await request.json().catch(()=>null) as any;
    if(!body||typeof body!=="object") throw new Error("pos_manager_invalid_payload");
    const action=String(body.action||"");
    let result:any;
    if(action==="cash_tender"){
      result=await recordPosCashTender({
        locationId:device.locationId,
        checkId:String(body.checkId||""),
        cashReceivedCents:Number(body.cashReceivedCents||0),
        amountCents:body.amountCents==null?null:Number(body.amountCents),
        tipCents:Number(body.tipCents||0),
        staffProfileId:body.staffProfileId?String(body.staffProfileId):null,
        deviceId:device.deviceId,
      });
    }else if(action==="refund_tender"){
      result=await refundPosTender({
        locationId:device.locationId,
        tenderId:String(body.tenderId||""),
        amountCents:Number(body.amountCents||0),
        actorStaffProfileId:String(body.actorStaffProfileId||""),
        approverStaffProfileId:String(body.approverStaffProfileId||""),
        reason:String(body.reason||""),
        idempotencyKey:String(body.idempotencyKey||""),
      });
    }else if(action==="discount_check"){
      result=await applyPosCheckDiscount({
        locationId:device.locationId,
        checkId:String(body.checkId||""),
        discountCents:Number(body.discountCents||0),
        actorStaffProfileId:String(body.actorStaffProfileId||""),
        approverStaffProfileId:String(body.approverStaffProfileId||""),
        reason:String(body.reason||""),
      });
    }else if(action==="void_item"){
      result=await voidPosOrderItem({
        locationId:device.locationId,
        orderItemId:String(body.orderItemId||""),
        actorStaffProfileId:String(body.actorStaffProfileId||""),
        approverStaffProfileId:String(body.approverStaffProfileId||""),
        reason:String(body.reason||""),
      });
    }else if(action==="open_drawer"){
      result=await openPosCashDrawerSession({
        locationId:device.locationId,
        deviceId:device.deviceId,
        staffProfileId:body.staffProfileId?String(body.staffProfileId):null,
        openingCashCents:Number(body.openingCashCents||0),
      });
    }else if(action==="close_drawer"){
      result=await closePosCashDrawerSession({
        locationId:device.locationId,
        sessionId:String(body.sessionId||""),
        countedCashCents:Number(body.countedCashCents||0),
      });
    }else{
      throw new Error("pos_manager_invalid_action");
    }
    return NextResponse.json({ok:true,result},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"pos_manager_failed";
    return NextResponse.json({ok:false,error:message},{status:statusFor(message),headers:{"Cache-Control":"no-store"}});
  }
}
