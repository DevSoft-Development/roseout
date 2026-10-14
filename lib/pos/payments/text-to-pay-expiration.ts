import "server-only";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";
import {stripeRequest} from "@/lib/stripe/server";

/**
 * Reopen a tender only after a signed Connect expiration event and an
 * independent test-mode Stripe confirmation that checkout is unpaid/expired.
 * Never cancel a paid or completed local session.
 */
export async function expireVerifiedTextToPay(input:{
 checkoutSessionId:string;accountId:string;locationId:string;sessionId:string;
}){
 if(process.env.POS_TEXT_TO_PAY_STRIPE_SETTLEMENT_ENABLED!=="true")return;
 if(!/^cs_test_[A-Za-z0-9]+$/.test(input.checkoutSessionId)||
    !/^acct_[A-Za-z0-9]+$/.test(input.accountId)||
    !/^[a-f0-9-]{36}$/i.test(input.locationId)||
    !/^[a-f0-9-]{36}$/i.test(input.sessionId))throw Error("checkout_expiry_invalid_reference");
 const remote=await stripeRequest<{id:string;status:string;payment_status:string;metadata:Record<string,string>}>(
  "/checkout/sessions/"+encodeURIComponent(input.checkoutSessionId),
  {method:"GET",stripeAccount:input.accountId,mode:"test"});
 if(remote.id!==input.checkoutSessionId||remote.status!=="expired"||
    remote.payment_status==="paid"||remote.metadata?.type!=="pos_text_to_pay"||
    remote.metadata?.location_id!==input.locationId||
    remote.metadata?.session_id!==input.sessionId)throw Error("checkout_expiry_unverified");
 const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
 const row=await shard.client.from("pos_text_to_pay_sessions").update({
  status:"expired",updated_at:new Date().toISOString()
 }).eq("id",input.sessionId).eq("location_id",input.locationId)
   .eq("connected_account_id",input.accountId)
   .eq("checkout_session_id",input.checkoutSessionId).eq("status","paying")
   .is("payment_intent_id",null).select("id").maybeSingle();
 if(row.error)throw Error("checkout_expiry_reconcile_failed");
}
