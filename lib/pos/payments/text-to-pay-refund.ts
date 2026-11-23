import "server-only";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";

/**
 * Call only from a verified Stripe Connect charge.refunded event in test mode.
 * Non-POS charges are ignored; a matched POS charge must reconcile atomically.
 */
export async function reconcileVerifiedPosTextToPayRefund(input:{
 locationId:string;accountId:string;paymentIntentId:string;eventId:string;
 amountCents:number;refundedCents:number;currency:string;
}){
 if(process.env.POS_TEXT_TO_PAY_STRIPE_SETTLEMENT_ENABLED!=="true")return;
 if(!/^acct_[A-Za-z0-9]+$/.test(input.accountId)||
    !/^pi_[A-Za-z0-9]+$/.test(input.paymentIntentId)||
    !/^evt_[A-Za-z0-9]+$/.test(input.eventId)||
    !Number.isSafeInteger(input.amountCents)||input.amountCents<=0||
    !Number.isSafeInteger(input.refundedCents)||input.refundedCents<0||
    input.refundedCents>input.amountCents||!/^[a-z]{3}$/.test(input.currency))
    throw Error("invalid_pos_refund_event");
 const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
 const found=await shard.client.from("pos_text_to_pay_sessions")
  .select("id").eq("location_id",input.locationId)
  .eq("connected_account_id",input.accountId)
  .eq("payment_intent_id",input.paymentIntentId)
  .eq("status","paid").limit(1);
 if(found.error)throw Error("pos_refund_lookup_failed");
 if(!found.data?.length)return;
 const result=await shard.client.rpc("pos_reconcile_text_to_pay_refund",{
  p_location_id:input.locationId,p_connected_account_id:input.accountId,
  p_payment_intent_id:input.paymentIntentId,
  p_charge_amount_cents:input.amountCents,p_refunded_cents:input.refundedCents,
  p_currency:input.currency,p_event_id:input.eventId
 });
 if(result.error||result.data!==true)throw Error("pos_refund_reconciliation_failed");
}
