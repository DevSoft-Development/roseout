import "server-only";
import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";
import { getPosTransactionEvidenceMetadata } from "./transaction-evidence";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const html=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
}[c]!));
const cents=(v:unknown)=>"$"+(Number(v??0)/100).toFixed(2);

/**
 * Read-only evidence manifest. Must only be called by a server route after
 * manager authorization for locationId. Never downloads signature bytes.
 */
export async function preparePosDisputeManifest(locationId:string,tenderId:string) {
  if(!UUID.test(locationId)||!UUID.test(tenderId))throw new Error("pos_dispute_invalid_identifier");
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const {data:tender,error:tenderError}=await shard.client.from("pos_tenders")
    .select("id,check_id,status,amount_cents,tip_cents,created_at")
    .eq("location_id",locationId).eq("id",tenderId).maybeSingle();
  if(tenderError||!tender)throw new Error("pos_dispute_tender_not_found");
  const [checkResult,paymentResult,itemsResult,evidence]=await Promise.all([
    shard.client.from("pos_checks").select("id,status,subtotal_cents,tax_cents,total_cents,created_at").eq("location_id",locationId).eq("id",tender.check_id).maybeSingle(),
    shard.client.from("pos_payments").select("provider,provider_payment_intent_id,status,amount_cents").eq("location_id",locationId).eq("tender_id",tenderId).limit(1),
    shard.client.from("pos_order_items").select("id,item_name,quantity,unit_price_cents,unit_modifier_total_cents,discount_cents,line_total_cents,seat_number,modifiers,status").eq("location_id",locationId).eq("check_id",tender.check_id).neq("status","voided").order("created_at",{ascending:true}),
    getPosTransactionEvidenceMetadata(locationId,tenderId),
  ]);
  if(checkResult.error||paymentResult.error||itemsResult.error)throw new Error("pos_dispute_lookup_failed");
  return {
    version:1,locationId,tenderId,generatedAt:new Date().toISOString(),
    tender,check:checkResult.data,items:itemsResult.data??[],payments:paymentResult.data??[],
    evidence:evidence.map(row=>({...row,signaturePresent:row.evidence_type==="customer_signature"})),
    warning:"Signature is optional evidence; it is not definitive proof of cardholder authorization.",
  };
}

/** Printable HTML; PDF can be produced using the browser's Print > Save as PDF. */
export function renderPrintablePosDisputePacket(manifest:Awaited<ReturnType<typeof preparePosDisputeManifest>>) {
  const evidence=manifest.evidence.map(e=>`<tr><td>${html(e.evidence_type)}</td><td>${html(e.captured_at)}</td><td><code>${html(e.sha256_hex)}</code></td></tr>`).join("");
  const items=manifest.items.map(i=>`<tr><td>${html(i.item_name)}</td><td>${html(i.quantity)}</td><td>${html(cents(i.line_total_cents))}</td><td>${html(i.seat_number??"")}</td></tr>`).join("");
  const payments=manifest.payments.map(p=>`<tr><td>${html(p.provider)}</td><td>${html(p.provider_payment_intent_id)}</td><td>${html(p.status)}</td><td>${html(cents(p.amount_cents))}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>POS evidence ${html(manifest.tenderId)}</title><style>
    body{font:14px system-ui,sans-serif;color:#111;max-width:820px;margin:40px auto;padding:0 24px}
    h1{font-size:24px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border-bottom:1px solid #ddd;padding:10px;text-align:left;overflow-wrap:anywhere}
    .note{padding:12px;border:1px solid #777}code{font-size:11px}@media print{body{margin:0;padding:0}tr{break-inside:avoid}}
  </style></head><body><h1>ThePOSHaven — Transaction Evidence</h1>
  <p>Location: ${html(manifest.locationId)}<br>Tender: ${html(manifest.tenderId)}<br>Generated UTC: ${html(manifest.generatedAt)}</p>
  <h2>Transaction</h2><p>Check: ${html(manifest.tender.check_id)} · Status: ${html(manifest.tender.status)}</p>
  <p>Tender amount: ${html(cents(manifest.tender.amount_cents))} · Recorded tip: ${html(cents(manifest.tender.tip_cents))}</p>
  <h2>Itemized receipt</h2><table><thead><tr><th>Item</th><th>Quantity</th><th>Line total</th><th>Seat</th></tr></thead><tbody>${items}</tbody></table>
  <p>Recorded check subtotal: ${html(cents(manifest.check?.subtotal_cents))} · Tax: ${html(cents(manifest.check?.tax_cents))} · Total: ${html(cents(manifest.check?.total_cents))}</p>
  <h2>Processor references</h2><table><thead><tr><th>Provider</th><th>Payment intent</th><th>Status</th><th>Amount</th></tr></thead><tbody>${payments}</tbody></table>
  <h2>Evidence manifest</h2><table><thead><tr><th>Type</th><th>Captured</th><th>SHA-256</th></tr></thead><tbody>${evidence}</tbody></table>
  <p class="note">${html(manifest.warning)} This manifest lists evidence identifiers and itemized receipt records, but does not embed the signature image or customer communications. A complete dispute submission requires human review.</p>
  </body></html>`;
}
