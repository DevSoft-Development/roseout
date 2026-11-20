import "server-only";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";
import {createCheckCardPayment} from "./check-payment-service";
import {getStripeModeForLocation} from "@/lib/stripe/server";

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Input={location:Record<string,unknown>;checkId:string;selectedTipBasisPoints:number;staffProfileId?:string|null};
export async function createPolicyQuotedCheckPayment(input:Input){
 const locationId=String(input.location.id||"");
 if(!UUID.test(locationId)||!UUID.test(input.checkId))throw Error("invalid_pos_checkout_identifier");
 if(process.env.POS_CHECKOUT_SERVER_QUOTED_TIPS_ENABLED!=="true")throw Error("pos_quoted_checkout_not_certified");
 // Controlled staging/sandbox checkout only until live tax/service-charge certification.
 if(getStripeModeForLocation(input.location)!=="test")throw Error("pos_checkout_sandbox_only");
 const shard=await resolveOperationalShardForLocationId(locationId,{mode:"write"});
 const [check,policy]=await Promise.all([
  shard.client.from("pos_checks").select("id,location_id,guest_count,status,subtotal_cents,service_charge_cents,tax_cents,total_cents,currency").eq("id",input.checkId).eq("location_id",locationId).maybeSingle(),
  shard.client.from("pos_gratuity_policies").select("suggestions_enabled,tip_suggestions,auto_service_charge_enabled,extra_tip_prompt_with_service_charge,service_charge_percent_bps,customer_disclosure").eq("location_id",locationId).maybeSingle()
 ]);
 if(check.error||!check.data||!["open","held"].includes(check.data.status)||policy.error)throw Error("pos_checkout_unavailable");
 const c=check.data,p=policy.data;
 const bps=input.selectedTipBasisPoints;
 if(!Number.isSafeInteger(bps)||bps<0||bps>3000||bps%100!==0)throw Error("invalid_tip_selection");
 if(p?.auto_service_charge_enabled){
  if(!Number.isSafeInteger(c.service_charge_cents)||c.service_charge_cents<=0||
     !p.customer_disclosure||p.customer_disclosure.trim().length<16)
   throw Error("service_charge_not_disclosed_or_persisted");
  if(bps!==0&&!p.extra_tip_prompt_with_service_charge)throw Error("extra_tip_disabled");
 }else if(c.service_charge_cents>0){
  throw Error("unconfigured_service_charge");
 }
 if(bps!==0&&(!p?.suggestions_enabled||!Array.isArray(p.tip_suggestions)||
    !p.tip_suggestions.includes(bps/100)))throw Error("tip_not_allowed_by_policy");
 const tipCents=Math.floor((c.subtotal_cents*bps+5000)/10000);
 if(!Number.isSafeInteger(tipCents)||tipCents<0)throw Error("invalid_tip_total");
 // POS atomic tender RPC uses stored check.total_cents (including tax) and
 // adds the requested tip separately to the processor PaymentIntent.
 const result=await createCheckCardPayment({
  location:input.location,checkId:input.checkId,tipCents,staffProfileId:input.staffProfileId||null
 });
 return {payment:result,checkoutQuote:{
  subtotalCents:c.subtotal_cents,taxCents:c.tax_cents,
  serviceChargeCents:c.service_charge_cents,checkTotalCents:c.total_cents,
  tipCents,chargeTotalCents:c.total_cents+tipCents,currency:c.currency
 }};
}
