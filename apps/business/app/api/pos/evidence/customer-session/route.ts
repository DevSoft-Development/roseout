import {chooseCheckoutVerification,DEFAULT_VERIFICATION_POLICY} from "@/lib/pos/payments/customer-verification-policy";
import {verifyStripePosSettlement} from "@/lib/pos/payments/stripe-settlement-verification";
import {NextRequest,NextResponse} from "next/server";
import {authenticatePosDeviceCredential} from "@/lib/pos/device-command-service";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";
import {issueCustomerEvidenceSession,verifyCustomerEvidenceSession} from "@/lib/pos/payments/customer-evidence-session";
import {storeVerifiedPosSignature} from "@/lib/pos/payments/transaction-evidence";
export const dynamic="force-dynamic";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
function error(status:number,code:string){return NextResponse.json({ok:false,error:code},{status,headers});}
async function deviceAuth(r:NextRequest){
 const bearer=r.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))throw Error("unauthorized");
 return authenticatePosDeviceCredential({deviceId:r.headers.get("x-pos-device-id")||"",credential:bearer.slice(7)});
}
async function verifyTender(locationId:string,checkId:string,tenderId:string){
 const shard=await resolveOperationalShardForLocationId(locationId,{mode:"write"});
 const t=await shard.client.from("pos_tenders").select("id,status,tender_type,total_cents")
 .eq("location_id",locationId).eq("check_id",checkId).eq("id",tenderId).maybeSingle();
 if(t.error||t.data?.status!=="completed"||t.data?.tender_type==="cash")throw Error("tender_unverified");
 const p=await shard.client.from("pos_payments").select("id,provider_payment_intent_id,connected_account_id,status,amount_cents")
 .eq("location_id",locationId).eq("check_id",checkId).eq("tender_id",tenderId).eq("status","succeeded").maybeSingle();
 if(p.error||!p.data?.provider_payment_intent_id||!p.data.connected_account_id)throw Error("payment_unverified");
 const check=await shard.client.from("pos_checks").select("currency").eq("location_id",locationId).eq("id",checkId).maybeSingle();
 if(check.error||!check.data)throw Error("check_unverified");
 await verifyStripePosSettlement({locationId,checkId,tenderId,expectedAmountCents:Number(t.data.total_cents),currency:check.data.currency,payment:p.data});
 return shard;
}
/** Issuance and capture are disabled until provider reconciliation and physical-device testing. */
export async function POST(request:NextRequest){
 if(process.env.POS_CUSTOMER_SIGNATURE_DEVICE_SESSIONS_ENABLED!=="true")return error(503,"device_signature_not_certified");
 const length=Number(request.headers.get("content-length")||0);
 if(length>1500000)return error(413,"payload_too_large");
 let device;
 try{device=await deviceAuth(request);}catch{return error(401,"unauthorized_device");}
 // Bound the actual request bytes, independent of untrusted Content-Length.
 if(!request.body)return error(400,"missing_payload");
 const reader=request.body.getReader();
 const chunks:Buffer[]=[];
 let readBytes=0;
 try{
  for(;;){
   const next=await reader.read();
   if(next.done)break;
   readBytes+=next.value.byteLength;
   if(readBytes>1500000){await reader.cancel();return error(413,"payload_too_large");}
   chunks.push(Buffer.from(next.value));
  }
 }catch{return error(400,"invalid_payload");}
 let body:Record<string,any>|null=null;
 try{const parsed=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))body=parsed;}catch{}
 if(!body)return error(400,"invalid_payload");
 const locationId=String(device.locationId||""),deviceId=String(device.deviceId||"");
 const checkId=String(body?.checkId||""),tenderId=String(body?.tenderId||"");
 if(!uuid.test(locationId)||!uuid.test(checkId)||!uuid.test(tenderId))return error(400,"invalid_tender");
 try{
  const shard=await verifyTender(locationId,checkId,tenderId);
  if(body?.action==="issue"){
   // A high-value QR handoff must be customer controlled, not an employee's
   // self-attested customerPresent flag. Until the QR redemption route is
   // certified, deny issuance for policies that require QR.
   if(process.env.POS_HIGH_VALUE_QR_VERIFICATION_ENABLED==="true"){
    const policy=await shard.client.from("pos_customer_verification_policies")
     .select("enabled,qr_threshold_cents,customer_screen_threshold_cents")
     .eq("location_id",locationId).maybeSingle();
    if(policy.error)throw Error("customer_verification_policy_unavailable");
    const tender=await shard.client.from("pos_tenders").select("total_cents")
     .eq("location_id",locationId).eq("check_id",checkId).eq("id",tenderId).maybeSingle();
    if(tender.error||!tender.data)throw Error("verification_total_unavailable");
    const configured=policy.data?{
     enabled:policy.data.enabled===true,
     qrThresholdCents:Number(policy.data.qr_threshold_cents),
     customerScreenThresholdCents:Number(policy.data.customer_screen_threshold_cents)
    }:DEFAULT_VERIFICATION_POLICY;
    const mode=chooseCheckoutVerification(Number(tender.data.total_cents),configured);
    if(mode==="qr")return error(409,"qr_customer_handoff_required");
   }
   // Fail closed on repeated or parallel requests for a customer handoff.
   if(body.customerPresent!==true)return error(403,"customer_presence_not_confirmed");
   const latest=await shard.client.from("pos_evidence_customer_sessions")
    .select("nonce").eq("location_id",locationId).eq("tender_id",tenderId)
    .is("consumed_at",null).gt("expires_at",new Date().toISOString()).limit(1);
   if(latest.error||latest.data?.length)return error(409,"signature_session_already_active");
   const token=issueCustomerEvidenceSession({locationId,checkId,tenderId,deviceId});
   const claims=verifyCustomerEvidenceSession(token,{locationId,checkId,tenderId,deviceId});
   const inserted=await shard.client.from("pos_evidence_customer_sessions").insert({
    nonce:claims.nonce,location_id:locationId,check_id:checkId,tender_id:tenderId,device_id:deviceId,
    expires_at:new Date(claims.expiresAt).toISOString()
   });
   if(inserted.error)throw Error("session_persist_failed");
   return NextResponse.json({ok:true,token,expiresAt:claims.expiresAt},{headers});
  }
  if(body?.action!=="capture"||typeof body.token!=="string"||typeof body.pngBase64!=="string"||
     body.pngBase64.length>1400000||!/^[A-Za-z0-9+/]+={0,2}$/.test(body.pngBase64))return error(400,"invalid_capture");
  const claims=verifyCustomerEvidenceSession(body.token,{locationId,checkId,tenderId,deviceId});
  const used=await shard.client.rpc("pos_consume_evidence_session",{
   p_nonce:claims.nonce,p_location_id:locationId,p_check_id:checkId,p_tender_id:tenderId,p_device_id:deviceId
  });
  if(used.error||used.data!==true)return error(409,"signature_session_used_or_expired");
  // Fail closed: a consumed nonce cannot be replayed, including after storage failure.
  const saved=await storeVerifiedPosSignature({
   locationId,checkId,tenderId,png:Buffer.from(body.pngBase64,"base64"),
   source:"customer_display",signedAt:new Date().toISOString()
  });
  return NextResponse.json({ok:true,evidenceId:saved.id},{headers});
 }catch{return error(409,"signature_session_or_payment_unavailable");}
}
