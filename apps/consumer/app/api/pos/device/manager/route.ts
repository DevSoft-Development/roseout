import { NextResponse } from "next/server";
import { authenticatePosDeviceCredential } from "@/lib/pos/device-command-service";
import { requirePosAccess } from "@/lib/pos/access";
import { verifyPosManagerApproval } from "@/lib/pos/manager-approval";
import {
  applyPosCheckDiscount,
  closePosCashDrawerSession,
  getPosManagerOperations,
  openPosCashDrawerSession,
  queuePosCheckReceipt,
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
  if(/unauthorized|missing_credential/.test(message)) return 401;
  if(/subscription_required/.test(message)) return 403;
  if(/not_found/.test(message)) return 404;
  if(/approval_required|pin_invalid/.test(message)) return 403;
  if(/not_payable|already_paid|not_refundable|exceeds_available|session_closed/.test(message)) return 409;
  if(/invalid_|missing_|reason_required|insufficient/.test(message)) return 400;
  if(message.startsWith("operational_shard_")) return 503;
  return 500;
}

async function manager(locationId:string,body:any){
  return verifyPosManagerApproval({
    locationId,
    staffProfileId:String(body.managerStaffProfileId||body.manager_staff_profile_id||""),
    pin:String(body.managerPin||body.manager_pin||""),
  });
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
    const actorStaffProfileId=String(body.actorStaffProfileId||body.actor_staff_profile_id||"").trim()||null;
    let result:any;
    if(action==="cash_tender"){
      result=await recordPosCashTender({
        locationId:device.locationId,
        checkId:String(body.checkId||""),
        cashReceivedCents:Number(body.cashReceivedCents||0),
        amountCents:body.amountCents==null?null:Number(body.amountCents),
        tipCents:Number(body.tipCents||0),
        staffProfileId:actorStaffProfileId,
        deviceId:device.deviceId,
      });
    }else if(action==="refund_tender"){
      const approval=await manager(device.locationId,body);
      result=await refundPosTender({
        locationId:device.locationId,
        tenderId:String(body.tenderId||""),
        amountCents:Number(body.amountCents||0),
        actorStaffProfileId:actorStaffProfileId||approval.staffProfileId,
        approverStaffProfileId:approval.staffProfileId,
        reason:String(body.reason||""),
        idempotencyKey:String(body.idempotencyKey||""),
      });
    }else if(action==="discount_check"){
      const approval=await manager(device.locationId,body);
      result=await applyPosCheckDiscount({
        locationId:device.locationId,
        checkId:String(body.checkId||""),
        discountCents:Number(body.discountCents||0),
        actorStaffProfileId:actorStaffProfileId||approval.staffProfileId,
        approverStaffProfileId:approval.staffProfileId,
        reason:String(body.reason||""),
      });
    }else if(action==="void_item"){
      const approval=await manager(device.locationId,body);
      result=await voidPosOrderItem({
        locationId:device.locationId,
        orderItemId:String(body.orderItemId||""),
        actorStaffProfileId:actorStaffProfileId||approval.staffProfileId,
        approverStaffProfileId:approval.staffProfileId,
        reason:String(body.reason||""),
      });
    }else if(action==="open_drawer"){
      result=await openPosCashDrawerSession({
        locationId:device.locationId,
        deviceId:device.deviceId,
        staffProfileId:actorStaffProfileId,
        openingCashCents:Number(body.openingCashCents||0),
      });
    }else if(action==="close_drawer"){
      await manager(device.locationId,body);
      result=await closePosCashDrawerSession({
        locationId:device.locationId,
        sessionId:String(body.sessionId||""),
        countedCashCents:Number(body.countedCashCents||0),
      });
    }else if(action==="receipt_reprint"){
      result=await queuePosCheckReceipt({
        locationId:device.locationId,
        checkId:String(body.checkId||""),
        reprint:true,
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
