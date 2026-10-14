import "server-only";
import {randomUUID} from "node:crypto";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";

type Action="list"|"view"|"download"|"export_packet"|"capture";
type Result="allowed"|"denied"|"error";

/**
 * Audit evidence access before emitting a private export.
 * A logging failure must fail closed, not silently allow unrecorded exports.
 */
export async function auditPosEvidenceAccess(input:{
 locationId:string;tenderId:string;actorUserId:string;action:Action;result:Result;
 evidenceId?:string|null;requestId?:string;
}){
 const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"write"});
 const {error}=await shard.client.from("pos_evidence_access_events").insert({
  location_id:input.locationId,tender_id:input.tenderId,
  actor_user_id:input.actorUserId,evidence_id:input.evidenceId||null,
  action:input.action,result:input.result,request_id:input.requestId||randomUUID(),
 });
 if(error)throw new Error("pos_evidence_audit_unavailable");
}
