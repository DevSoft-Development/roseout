import {prepareTextToPayQuote} from "@/lib/pos/payments/text-to-pay-quote";
import {stripeRequest} from "@/lib/stripe/server";
import {NextRequest,NextResponse} from "next/server";
import {hashTextToPayToken} from "@/lib/pos/payments/text-to-pay-session";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const failure=(status:number)=>NextResponse.json({error:"checkout_unavailable"},{status,headers});
async function load(request:NextRequest,params:{locationId:string;token:string}){
 if(process.env.POS_TEXT_TO_PAY_CUSTOMER_REVIEW_ENABLED!=="true")throw Error("not_certified");
 if(!UUID.test(params.locationId))throw Error("invalid_location");
 const tokenHash=hashTextToPayToken(params.token);
 const shard=await resolveOperationalShardForLocationId(params.locationId,{mode:"write"});
 const row=await shard.client.from("pos_text_to_pay_sessions")
  .select("id,location_id,check_id,tender_id,amount_cents,currency,agreement_sha256,receipt_snapshot,connected_account_id,checkout_session_id,status,expires_at")
  .eq("location_id",params.locationId).eq("token_sha256",tokenHash).maybeSingle();
 if(row.error||!row.data||Date.parse(row.data.expires_at)<=Date.now()||
  !["issued","reviewed","accepted"].includes(row.data.status))throw Error("invalid_session");
 return {shard,session:row.data,tokenHash};
}
export async function GET(request:NextRequest){
 const locationId=request.nextUrl.searchParams.get("locationId")||"";
 const token=request.nextUrl.searchParams.get("token")||"";
 try{
  const {session}=await load(request,{locationId,token});
  // No PII, SMS destination or staff identity is returned to a bearer-token holder.
  const current=await prepareTextToPayQuote(session.location_id,session.check_id,session.tender_id);
  if(current.sha256!==session.agreement_sha256)return failure(409);
  return NextResponse.json({
   receipt:session.receipt_snapshot,
   status:session.status,amountCents:session.amount_cents,
   currency:session.currency,agreementSha256:session.agreement_sha256,
   expiresAt:session.expires_at,requiresExplicitAgreement:true,
   paymentEnabled:process.env.POS_TEXT_TO_PAY_STRIPE_CHECKOUT_ENABLED==="true"
  },{headers});
 }catch{return failure(404);}
}
export async function POST(request:NextRequest){
 if(Number(request.headers.get("content-length")||0)>2048)return failure(413);
 let body:{locationId?:string;token?:string;action?:string;amountCents?:number;agreementSha256?:string};
 try{const raw=await request.text();if(raw.length>2048)return failure(413);body=JSON.parse(raw);}catch{return failure(400);}
 if(!body||!["review","accept","pay"].includes(body.action||""))return failure(400);
 try{
  const {shard,session,tokenHash}=await load(request,{
   locationId:String(body.locationId||""),token:String(body.token||"")
  });
  if(body.amountCents!==session.amount_cents||body.agreementSha256!==session.agreement_sha256)
   return failure(409);
  const current=await prepareTextToPayQuote(session.location_id,session.check_id,session.tender_id);
  if(current.sha256!==session.agreement_sha256)return failure(409);
  if(body.action==="pay"){
   if(process.env.POS_TEXT_TO_PAY_STRIPE_CHECKOUT_ENABLED!=="true")return failure(503);
   if(session.status!=="accepted")return failure(409);
   const base=process.env.POS_TEXT_TO_PAY_CUSTOMER_ORIGIN;
   if(!base||!base.startsWith("https://") || !/^[a-z0-9.-]+$/i.test(base.slice(8)))return failure(503);
   // Only a confirmed sandbox connected account can receive these funds.
   if(!/^acct_[A-Za-z0-9]+$/.test(String(session.connected_account_id)))return failure(503);
   const amount=Number(session.amount_cents);
   const form=new URLSearchParams();
   form.set("mode","payment");
   form.set("payment_method_types[0]","card");
   form.set("line_items[0][price_data][currency]",String(session.currency));
   form.set("line_items[0][price_data][unit_amount]",String(amount));
   form.set("line_items[0][price_data][product_data][name]","ThePOSHaven checkout "+String(session.check_id).slice(0,8));
   form.set("line_items[0][quantity]","1");
   // Stripe requires an expiry at least 30 minutes after receipt; include clock/transport margin.
   form.set("expires_at",String(Math.ceil(Date.now()/1000)+31*60));
   form.set("success_url",base+"/pos/customer/checkout/success?session_id={CHECKOUT_SESSION_ID}");
   form.set("cancel_url",base+"/pos/customer/checkout/cancelled");
   for(const [key,value] of Object.entries({
    type:"pos_text_to_pay",location_id:String(session.location_id),
    check_id:String(session.check_id),tender_id:String(session.tender_id),
    receipt_sha256:String(session.agreement_sha256),session_id:String(session.id)
   })){
    form.set("metadata["+key+"]",value);
    form.set("payment_intent_data[metadata]["+key+"]",value);
   }
   try{
    const checkout=await stripeRequest<{id:string;url:string;mode:string;payment_status:string}>(
     "/checkout/sessions",{method:"POST",body:form,
      stripeAccount:String(session.connected_account_id),mode:"test",
      idempotencyKey:"pos-text-to-pay-"+String(session.id)});
    if(!checkout.id?.startsWith("cs_test_")||!checkout.url?.startsWith("https://checkout.stripe.com/"))
     return failure(503);
    const changed=await shard.client.rpc("pos_text_to_pay_advance",{
     p_token_sha256:tokenHash,p_from:"accepted",p_to:"paying",
     p_amount_cents:amount,p_agreement_sha256:session.agreement_sha256
    });
    if(changed.error||changed.data!==true)return failure(409);
    const saved=await shard.client.from("pos_text_to_pay_sessions")
      .update({checkout_session_id:checkout.id}).eq("id",session.id).eq("status","paying");
    if(saved.error)return failure(503);
    return NextResponse.json({ok:true,checkoutUrl:checkout.url,status:"paying"},{headers});
   }catch{return failure(503);}
  }
  const from=body.action==="review"?"issued":"reviewed";
  const to=body.action==="review"?"reviewed":"accepted";
  if(session.status!==from)return failure(409);
  const changed=await shard.client.rpc("pos_text_to_pay_advance",{
   p_token_sha256:tokenHash,p_from:from,p_to:to,
   p_amount_cents:session.amount_cents,p_agreement_sha256:session.agreement_sha256
  });
  if(changed.error||changed.data!==true)return failure(409);
  return NextResponse.json({ok:true,status:to,paymentEnabled:false},{headers});
 }catch{return failure(404);}
}
