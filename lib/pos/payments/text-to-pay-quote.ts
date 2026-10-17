import "server-only";
import {createHash} from "node:crypto";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";

export const TEXT_TO_PAY_TERMS_VERSION="pos-checkout-authorization-v1";
export const TEXT_TO_PAY_TERMS="I have reviewed the displayed items, taxes, service charges and final total and authorize payment for this purchase. I understand any separately presented cancellation or refund policy must be provided before payment.";

export async function prepareTextToPayQuote(locationId:string,checkId:string,tenderId:string){
 const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
 const [check,tender,items]=await Promise.all([
  shard.client.from("pos_checks").select("id,location_id,currency,status,subtotal_cents,discount_cents,tax_cents,service_charge_cents,total_cents")
   .eq("location_id",locationId).eq("id",checkId).maybeSingle(),
  shard.client.from("pos_tenders").select("id,check_id,location_id,status,tender_type,amount_cents,tip_cents,total_cents")
   .eq("location_id",locationId).eq("check_id",checkId).eq("id",tenderId).maybeSingle(),
  shard.client.from("pos_order_items").select("id,item_name,quantity,unit_price_cents,unit_modifier_total_cents,discount_cents,line_total_cents,status")
   .eq("location_id",locationId).eq("check_id",checkId).neq("status","voided").order("id",{ascending:true})
 ]);
 if(check.error||tender.error||items.error||!check.data||!tender.data||
   !["open","held"].includes(check.data.status)||tender.data.status!=="initiated"||
   tender.data.tender_type!=="card")throw Error("text_to_pay_quote_unavailable");
 const c=check.data,t=tender.data;
 const sum=Number(c.total_cents),paid=Number(t.total_cents);
 if(!Number.isSafeInteger(sum)||sum<=0||sum!==paid||
   !Number.isSafeInteger(t.tip_cents)||t.tip_cents!==0)throw Error("text_to_pay_amount_mismatch");
 const lines=(items.data||[]).map(x=>({
  id:String(x.id),name:String(x.item_name),quantity:Number(x.quantity),
  unitPriceCents:Number(x.unit_price_cents),modifierCents:Number(x.unit_modifier_total_cents),
  discountCents:Number(x.discount_cents),lineTotalCents:Number(x.line_total_cents)
 }));
 if(!lines.length)throw Error("text_to_pay_empty_order");
 const receipt={
  v:1,locationId,checkId,tenderId,currency:String(c.currency).toLowerCase(),
  items:lines,subtotalCents:Number(c.subtotal_cents),discountCents:Number(c.discount_cents),
  taxCents:Number(c.tax_cents),serviceChargeCents:Number(c.service_charge_cents),
  amountCents:paid,termsVersion:TEXT_TO_PAY_TERMS_VERSION,termsText:TEXT_TO_PAY_TERMS
 };
 const sha256=createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
 return {receipt,sha256};
}
