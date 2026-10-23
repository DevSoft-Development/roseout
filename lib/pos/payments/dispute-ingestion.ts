import "server-only";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";
import {supabaseAdmin} from "@/lib/supabase-admin";

/** Intake from a webhook whose Stripe signature and account context were already verified. */
export async function recordVerifiedPosDispute(input:{
 eventId:string;disputeId:string;paymentIntentId:string;connectedAccountId:string;
 amountCents:number;currency:string;reason:string;status:string;dueAt?:string|null;
}){
 if(process.env.POS_DISPUTE_INTAKE_ENABLED!=="true")throw Error("pos_dispute_intake_disabled");
 if(!/^evt_[A-Za-z0-9]+$/.test(input.eventId)||!/^dp_[A-Za-z0-9]+$/.test(input.disputeId)||
 !/^pi_[A-Za-z0-9]+$/.test(input.paymentIntentId)||!/^acct_[A-Za-z0-9]+$/.test(input.connectedAccountId)||
 !Number.isSafeInteger(input.amountCents)||input.amountCents<=0||!/^[a-z]{3}$/.test(input.currency))
  throw Error("invalid_verified_dispute");
 // Resolve the actual tender and location by processor identity, never webhook metadata alone.
 const {data:locations,error:locationsError}=await supabaseAdmin.from("locations")
  .select("id").eq("stripe_connect_account_id",input.connectedAccountId).limit(30);
 if(locationsError||!locations?.length)throw Error("dispute_account_unmapped");
 const matches:{locationId:string;tenderId:string}[]=[];
 for(const location of locations){
  const locationId=String(location.id);
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const payments=await shard.client.from("pos_payments")
   .select("tender_id").eq("location_id",locationId)
   .eq("provider","stripe").eq("provider_payment_intent_id",input.paymentIntentId)
   .eq("connected_account_id",input.connectedAccountId).limit(2);
  if(payments.error)throw Error("dispute_payment_lookup_failed");
  for(const p of payments.data||[])matches.push({locationId,tenderId:String(p.tender_id)});
 }
 if(matches.length!==1)throw Error("dispute_payment_ambiguous_or_missing");
 const match=matches[0];
 const shard=await resolveOperationalShardForLocationId(match.locationId,{mode:"write"});
 const insert=await shard.client.from("pos_dispute_cases").upsert({
  location_id:match.locationId,tender_id:match.tenderId,
  provider:"stripe",provider_event_id:input.eventId,
  provider_dispute_id:input.disputeId,provider_payment_intent_id:input.paymentIntentId,
  connected_account_id:input.connectedAccountId,amount_cents:input.amountCents,
  currency:input.currency,reason:input.reason,status:input.status,
  evidence_due_at:input.dueAt||null,updated_at:new Date().toISOString()
 },{onConflict:"provider,connected_account_id,provider_dispute_id",ignoreDuplicates:true});
 if(insert.error)throw Error("dispute_intake_write_failed");
 return {locationId:match.locationId,tenderId:match.tenderId};
}
