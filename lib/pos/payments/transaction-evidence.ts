import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";

const BUCKET = "pos-transaction-evidence";
const MAX_SIGNATURE_BYTES = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SignatureInput = {
  locationId: string;
  checkId: string;
  tenderId: string;
  png: Uint8Array;
  source: "customer_display" | "certified_reader";
  signedAt: string;
};

/** Called only by an authenticated, tenant-authorized server endpoint after device certification. */
export async function storeVerifiedPosSignature(input: SignatureInput) {
  if (![input.locationId, input.checkId, input.tenderId].every(id => UUID.test(id))) {
    throw new Error("pos_evidence_invalid_identifier");
  }
  if (!input.png.length || input.png.length > MAX_SIGNATURE_BYTES) throw new Error("pos_evidence_invalid_size");
  // Verify PNG magic bytes; mime claims supplied by the client are never trusted.
  if (Buffer.compare(Buffer.from(input.png.subarray(0, 8)), Buffer.from([137,80,78,71,13,10,26,10])) !== 0) {
    throw new Error("pos_evidence_invalid_png");
  }
  const at = Date.parse(input.signedAt);
  if (!Number.isFinite(at) || at > Date.now() + 60_000 || at < Date.now() - 15 * 60_000) {
    throw new Error("pos_evidence_invalid_timestamp");
  }

  const shard = await resolveOperationalShardForLocationId(input.locationId, {mode:"write"});
  const {data:tender,error:tenderError} = await shard.client.from("pos_tenders")
    .select("id,location_id,check_id,status,method")
    .eq("id",input.tenderId).eq("location_id",input.locationId).eq("check_id",input.checkId).maybeSingle();
  if (tenderError || !tender || tender.status !== "completed" || tender.method === "cash") {
    throw new Error("pos_evidence_tender_not_eligible");
  }
  const {data:payment,error:paymentError} = await shard.client.from("pos_payments")
    .select("id,status,provider_payment_intent_id")
    .eq("tender_id",input.tenderId).eq("check_id",input.checkId).eq("location_id",input.locationId)
    .eq("status","succeeded").maybeSingle();
  if (paymentError || !payment?.provider_payment_intent_id) throw new Error("pos_evidence_unverified_payment");

  const digest = createHash("sha256").update(input.png).digest("hex");
  const {data:existing,error:existingError} = await shard.client.from("pos_transaction_evidence")
    .select("id,sha256_hex").eq("location_id",input.locationId).eq("tender_id",input.tenderId)
    .eq("evidence_type","customer_signature").limit(1);
  if (existingError) throw new Error("pos_evidence_lookup_failed");
  if (existing?.length) {
    if (existing[0].sha256_hex !== digest) throw new Error("pos_evidence_already_exists");
    return {id:existing[0].id,sha256:digest,existing:true};
  }
  const objectKey = `pos-evidence/${input.locationId}/${input.tenderId}/${randomUUID()}.png`;
  const upload = await shard.client.storage.from(BUCKET).upload(objectKey, Buffer.from(input.png), {
    contentType:"image/png",upsert:false,cacheControl:"private,max-age=0",
  });
  if (upload.error) throw new Error("pos_evidence_storage_unavailable");
  const inserted = await shard.client.from("pos_transaction_evidence").insert({
    location_id:input.locationId,check_id:input.checkId,tender_id:input.tenderId,
    evidence_type:"customer_signature",storage_key:objectKey,sha256_hex:digest,
    content_type:"image/png",capture_source:input.source,signed_at:new Date(at).toISOString(),
    metadata:{payment_id:payment.id},
  }).select("id").single();
  if (inserted.error || !inserted.data) {
    await shard.client.storage.from(BUCKET).remove([objectKey]);
    throw new Error("pos_evidence_metadata_write_failed");
  }
  return {id:inserted.data.id,sha256:digest,existing:false};
}

/** Authorized managers only: caller must validate authenticated location membership before invoking. */
export async function getPosTransactionEvidenceMetadata(locationId:string,tenderId:string) {
  if (![locationId,tenderId].every(v=>UUID.test(v))) throw new Error("pos_evidence_invalid_identifier");
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const {data,error}=await shard.client.from("pos_transaction_evidence")
    .select("id,location_id,check_id,tender_id,evidence_type,sha256_hex,captured_at,signed_at,content_type")
    .eq("location_id",locationId).eq("tender_id",tenderId).order("captured_at",{ascending:false});
  if(error) throw new Error("pos_evidence_lookup_failed");
  return data??[];
}
