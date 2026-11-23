import "server-only";
import {createHash} from "node:crypto";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";
import {preparePosDisputeManifest} from "./dispute-packet";

/** Manager preparation is intentionally separate from submission to Stripe. */
export async function prepareDisputeReview(input:{
 locationId:string;disputeId:string;actorUserId:string;
}){
 if(process.env.POS_DISPUTE_CENTER_READ_ENABLED!=="true")throw Error("dispute_review_disabled");
 const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
 const found=await shard.client.from("pos_dispute_cases")
  .select("id,tender_id,reason,status,submitted_at,evidence_due_at")
  .eq("id",input.disputeId).eq("location_id",input.locationId).maybeSingle();
 if(found.error||!found.data)throw Error("dispute_not_found");
 if(found.data.submitted_at)throw Error("dispute_already_submitted");
 const manifest=await preparePosDisputeManifest(input.locationId,found.data.tender_id);
 const digest=createHash("sha256").update(JSON.stringify({...manifest,generatedAt:null})).digest("hex");
 const audit=await shard.client.from("pos_dispute_review_events").insert({
  location_id:input.locationId,dispute_id:input.disputeId,
  actor_user_id:input.actorUserId,action:"prepare",evidence_sha256:digest
 });
 if(audit.error)throw Error("dispute_review_audit_unavailable");
 return {manifest,sha256:digest,reason:found.data.reason,deadline:found.data.evidence_due_at};
}
