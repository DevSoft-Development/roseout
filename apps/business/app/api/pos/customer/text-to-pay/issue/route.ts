import {prepareTextToPayQuote} from "@/lib/pos/payments/text-to-pay-quote";
import {NextRequest,NextResponse} from "next/server";
import {authenticatePosDeviceCredential} from "@/lib/pos/device-command-service";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";
import {issueTextToPayChallenge} from "@/lib/pos/payments/text-to-pay-session";
import {sendSms} from "@/lib/sms/sendSms";
import {normalizePhone} from "@/lib/sms/telnyx";
import {supabaseAdmin} from "@/lib/supabase-admin";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const deny=(code:string,status=400)=>NextResponse.json({error:code},{status,headers});
export async function POST(request:NextRequest){
 if(process.env.POS_TEXT_TO_PAY_SMS_ENABLED!=="true")return deny("text_to_pay_not_certified",503);
 const auth=request.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer "))return deny("unauthorized_device",401);
 let device:{locationId:string;deviceId:string};
 try{device=await authenticatePosDeviceCredential({deviceId:request.headers.get("x-pos-device-id")||"",credential:auth.slice(7)});}
 catch{return deny("unauthorized_device",401);}
 let body:{checkId?:string;tenderId?:string;phone?:string;customerConsent?:boolean;agreementSha256?:string};
 try{
  if(Number(request.headers.get("content-length")||0)>4096)return deny("payload_too_large",413);
  const raw=await request.text();
  if(raw.length>4096)return deny("payload_too_large",413);
  body=JSON.parse(raw);
 }catch{return deny("invalid_payload");}
 if(!body||!UUID.test(String(body.checkId||""))||!UUID.test(String(body.tenderId||""))||
  body.customerConsent!==true)return deny("invalid_checkout_request");
 const phone=normalizePhone(body.phone);
 if(!/^\+[1-9]\d{7,14}$/.test(phone))return deny("invalid_phone");
 const loc=await supabaseAdmin.from("locations").select("id,is_demo,demo_key").eq("id",device.locationId).maybeSingle();
 if(loc.error||!loc.data||(loc.data.is_demo!==true&&loc.data.demo_key!=="real_location_mirror_demo"))
  return deny("sandbox_demo_only",403);
 try{
  const shard=await resolveOperationalShardForLocationId(device.locationId,{mode:"write"});
  const check=await shard.client.from("pos_checks").select("id,currency,status,total_cents")
   .eq("location_id",device.locationId).eq("id",body.checkId).maybeSingle();
  const tender=await shard.client.from("pos_tenders").select("id,status,check_id,total_cents")
   .eq("location_id",device.locationId).eq("check_id",body.checkId).eq("id",body.tenderId).maybeSingle();
  if(check.error||tender.error||!check.data||!tender.data||
   !["open","held"].includes(check.data.status)||tender.data.status!=="initiated"||
   !Number.isSafeInteger(tender.data.total_cents)||tender.data.total_cents<1||
   Number(tender.data.total_cents)!==Number(check.data.total_cents))return deny("checkout_totals_unavailable",409);
  const active=await shard.client.from("pos_text_to_pay_sessions").select("id")
   .eq("location_id",device.locationId).eq("tender_id",body.tenderId)
   .in("status",["issued","reviewed","accepted","paying"])
   .gt("expires_at",new Date().toISOString()).limit(1);
  if(active.error||active.data?.length)return deny("active_checkout_session",409);
  const quoted=await prepareTextToPayQuote(device.locationId,String(body.checkId),String(body.tenderId));
  if(body.agreementSha256!==quoted.sha256)return deny("receipt_agreement_mismatch",409);
  const issued=issueTextToPayChallenge({
   locationId:device.locationId,checkId:String(body.checkId),tenderId:String(body.tenderId),
   amountCents:quoted.receipt.amountCents,currency:quoted.receipt.currency,
   agreementSha256:quoted.sha256,expiresAt:new Date(Date.now()+10*60_000).toISOString()
  });
  const {data:connected,error:connectionError}=await supabaseAdmin.from("locations").select("stripe_connect_account_id").eq("id",device.locationId).maybeSingle();
  if(connectionError||!/^acct_[A-Za-z0-9]+$/.test(String(connected?.stripe_connect_account_id||"")))throw Error("connected_account_missing");
  const connectedAccountId=connected?.stripe_connect_account_id;
  if(!connectedAccountId)throw Error("connected_account_missing");
  const base=process.env.POS_TEXT_TO_PAY_CUSTOMER_ORIGIN;
  if(!base||!/^https:\/\/[a-z0-9.-]+$/i.test(base))throw Error("customer_origin_unconfigured");
  const inserted=await shard.client.from("pos_text_to_pay_sessions").insert({
   location_id:device.locationId,check_id:body.checkId,tender_id:body.tenderId,
   amount_cents:issued.snapshot.amountCents,currency:issued.snapshot.currency,
   agreement_sha256:issued.snapshot.agreementSha256,
   token_sha256:issued.tokenHash,expires_at:issued.snapshot.expiresAt,
   receipt_snapshot:quoted.receipt,connected_account_id:connectedAccountId
  });
  if(inserted.error)throw Error("session_create_failed");
  const url=base+"/pos/customer/checkout?locationId="+encodeURIComponent(device.locationId)+"&token="+encodeURIComponent(issued.token);
  try{
   const sms=await sendSms({to:phone,body:"ThePOSHaven: Review your secure checkout and agreement: "+url+" (expires in 10 minutes). Do not share this link."});
   if(!sms.id||/fail|reject|error/i.test(sms.status))throw Error("sms_not_accepted");
  }catch{
   // No link was returned: remove this issued session so staff can retry safely.
   await shard.client.from("pos_text_to_pay_sessions").update({status:"cancelled",updated_at:new Date().toISOString()})
    .eq("location_id",device.locationId).eq("token_sha256",issued.tokenHash).eq("status","issued");
   throw Error("sms_delivery_unavailable");
  }
  return NextResponse.json({ok:true,expiresAt:issued.snapshot.expiresAt},{headers});
 }catch{return deny("checkout_link_unavailable",503);}
}
