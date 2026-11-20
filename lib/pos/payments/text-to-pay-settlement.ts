import "server-only";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";
import {stripeRequest} from "@/lib/stripe/server";

/** Caller must have already verified a Stripe Connect webhook signature. */
export async function settleVerifiedTextToPay(input:{
 checkoutSessionId:string;accountId:string;locationId:string;checkId:string;
 tenderId:string;receiptSha256:string;sessionId:string;
}){
 if(process.env.POS_TEXT_TO_PAY_STRIPE_SETTLEMENT_ENABLED!=="true")throw Error("text_to_pay_settlement_not_certified");
 if(!/^cs_test_[A-Za-z0-9]+$/.test(input.checkoutSessionId)||
  !/^acct_[A-Za-z0-9]+$/.test(input.accountId))throw Error("invalid_checkout_reference");
 type Session={id:string;payment_status:string;status:string;mode:string;amount_total:number;
  currency:string;payment_intent:string;metadata:Record<string,string>};
 type Intent={id:string;status:string;amount:number;amount_received:number;currency:string;
  metadata:Record<string,string>};
 const checkout=await stripeRequest<Session>(
  "/checkout/sessions/"+encodeURIComponent(input.checkoutSessionId),
  {method:"GET",stripeAccount:input.accountId,mode:"test"});
 const expected={
  type:"pos_text_to_pay",location_id:input.locationId,check_id:input.checkId,
  tender_id:input.tenderId,receipt_sha256:input.receiptSha256,session_id:input.sessionId
 };
 if(checkout.id!==input.checkoutSessionId||checkout.status!=="complete"||
  checkout.payment_status!=="paid"||checkout.mode!=="payment"||
  !Number.isSafeInteger(checkout.amount_total)||checkout.amount_total<=0||
  Object.entries(expected).some(([k,v])=>checkout.metadata?.[k]!==v))throw Error("checkout_session_mismatch");
 const intent=await stripeRequest<Intent>(
  "/payment_intents/"+encodeURIComponent(checkout.payment_intent),
  {method:"GET",stripeAccount:input.accountId,mode:"test"});
 if(intent.id!==checkout.payment_intent||intent.status!=="succeeded"||
  intent.amount!==checkout.amount_total||intent.amount_received!==checkout.amount_total||
  intent.currency!==checkout.currency||
  Object.entries(expected).some(([k,v])=>intent.metadata?.[k]!==v))
  throw Error("checkout_payment_intent_mismatch");
 const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
 const session=await shard.client.from("pos_text_to_pay_sessions").select(
  "id,check_id,tender_id,location_id,token_sha256,amount_cents,currency,agreement_sha256,connected_account_id,checkout_session_id,status,signature_storage_key,signature_sha256,signature_signed_at"
 ).eq("id",input.sessionId).eq("location_id",input.locationId).maybeSingle();
 const r=session.data;
 if(session.error||!r||r.check_id!==input.checkId||r.tender_id!==input.tenderId||
  r.agreement_sha256!==input.receiptSha256||r.connected_account_id!==input.accountId||
  r.checkout_session_id!==input.checkoutSessionId||r.amount_cents!==checkout.amount_total||
  r.currency!==checkout.currency)throw Error("pos_checkout_binding_mismatch");
 const result=await shard.client.rpc("pos_settle_text_to_pay",{
  p_location_id:input.locationId,p_token_sha256:r.token_sha256,
  p_checkout_session_id:input.checkoutSessionId,
  p_payment_intent_id:intent.id,p_connected_account_id:input.accountId,
  p_amount_cents:checkout.amount_total,p_currency:checkout.currency
 });
 if(result.error||result.data!==true)throw Error("pos_checkout_ledger_settlement_failed");
 if(r.signature_storage_key&&r.signature_sha256&&r.signature_signed_at){
  const saved=await shard.client.from("pos_transaction_evidence").upsert({
   location_id:input.locationId,check_id:input.checkId,tender_id:input.tenderId,
   evidence_type:"customer_signature",storage_key:r.signature_storage_key,
   sha256_hex:r.signature_sha256,content_type:"image/png",capture_source:"customer_display",
   signed_at:r.signature_signed_at,
   metadata:{checkout_session_id:input.checkoutSessionId,payment_intent_id:intent.id,agreement_sha256:input.receiptSha256,customer_session_id:input.sessionId}
  },{onConflict:"location_id,tender_id,evidence_type,sha256_hex",ignoreDuplicates:true});
  if(saved.error)throw Error("pos_checkout_signature_evidence_reconcile_failed");
 }

 return {locationId:input.locationId,checkId:input.checkId,tenderId:input.tenderId};
}
