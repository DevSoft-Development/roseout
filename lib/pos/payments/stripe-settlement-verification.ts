import "server-only";
import {stripeRequest} from "@/lib/stripe/server";

type PaymentRow={provider_payment_intent_id:string;connected_account_id:string;amount_cents:number;currency?:string|null};
type StripeIntent={id:string;status:string;amount:number;amount_received:number;currency:string;metadata?:Record<string,string>;payment_method_types?:string[]};
const ID=/^pi_[a-zA-Z0-9]+$/;
const ACCOUNT=/^acct_[a-zA-Z0-9]+$/;

/** Independent connected-account verification for signature release. Fail closed. */
export async function verifyStripePosSettlement(input:{
 locationId:string;checkId:string;tenderId:string;expectedAmountCents:number;currency:string;payment:PaymentRow;
}){
 const {payment}=input;
 if(!ID.test(payment.provider_payment_intent_id)||!ACCOUNT.test(payment.connected_account_id))
  throw new Error("invalid_stripe_reference");
 if(process.env.POS_SIGNATURE_STRIPE_SETTLEMENT_VERIFICATION_ENABLED!=="true")
  throw new Error("stripe_signature_reconciliation_disabled");
 const intent=await stripeRequest<StripeIntent>(
  "/payment_intents/"+encodeURIComponent(payment.provider_payment_intent_id),
  {method:"GET",stripeAccount:payment.connected_account_id,mode:"test"}
 );
 if(intent.id!==payment.provider_payment_intent_id||intent.status!=="succeeded"||
    intent.amount!==input.expectedAmountCents||intent.amount_received!==input.expectedAmountCents||
    intent.amount!==payment.amount_cents||intent.currency?.toLowerCase()!==input.currency.toLowerCase()||
    intent.metadata?.tender_id!==input.tenderId||intent.metadata?.check_id!==input.checkId||
    intent.metadata?.location_id!==input.locationId||
    !intent.payment_method_types?.includes("card_present"))
   throw new Error("stripe_signature_payment_mismatch");
 return {paymentIntentId:intent.id,amountCents:intent.amount,currency:intent.currency};
}
