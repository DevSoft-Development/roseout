import "server-only";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export async function reviewOrganizationVerification(input:{
  actorUserId:string;
  requestId:string;
  decision:"approved"|"rejected"|"needs_more_info";
  notes?:string|null;
}){
  const db=getAdminDatabaseClient();
  const {data:admin}=await db.from("admin_users").select("role").eq("user_id",input.actorUserId).maybeSingle();
  if(!["superadmin","admin"].includes(String(admin?.role||"")))throw new Error("Admin verification access required.");
  const {data:request}=await db.from("organization_verification_requests").select("*").eq("id",input.requestId).maybeSingle();
  if(!request)throw new Error("Organization verification request not found.");
  const now=new Date().toISOString();
  const {error}=await db.from("organization_verification_requests").update({
    status:input.decision,
    review_notes:input.notes?.trim()||null,
    reviewed_by_user_id:input.actorUserId,
    reviewed_at:now,
    updated_at:now,
  }).eq("id",input.requestId);
  if(error)throw new Error(error.message);
  await db.from("organizations").update({
    verification_status:input.decision==="approved"?"verified":input.decision==="rejected"?"rejected":"pending",
    trust_level:input.decision==="approved"?3:0,
    legal_name:request.legal_name||undefined,
    updated_at:now,
  }).eq("id",request.organization_id);
  return {ok:true};
}

export async function reviewOrganizerVerification(input:{
  actorUserId:string;
  requestId:string;
  decision:"approved"|"rejected"|"needs_more_info";
  notes?:string|null;
  approvedTrustLevel?:number;
}){
  const db=getAdminDatabaseClient();
  const {data:admin}=await db.from("admin_users").select("role").eq("user_id",input.actorUserId).maybeSingle();
  if(!["superadmin","admin"].includes(String(admin?.role||"")))throw new Error("Admin verification access required.");
  const {data:request}=await db.from("organizer_verification_requests").select("*").eq("id",input.requestId).maybeSingle();
  if(!request)throw new Error("Organizer verification request not found.");
  const trustLevel=input.decision==="approved"?Math.min(5,Math.max(1,Number(input.approvedTrustLevel||1))):0;
  const now=new Date().toISOString();
  const {error}=await db.from("organizer_verification_requests").update({
    status:input.decision,
    approved_trust_level:input.decision==="approved"?trustLevel:null,
    review_notes:input.notes?.trim()||null,
    reviewed_by_user_id:input.actorUserId,
    reviewed_at:now,
    updated_at:now,
  }).eq("id",input.requestId);
  if(error)throw new Error(error.message);
  await db.from("organizer_profiles").update({
    verification_status:input.decision==="approved"?"verified":input.decision==="rejected"?"rejected":"pending",
    trust_level:trustLevel,
    publishing_status:input.decision==="approved"&&trustLevel>=4?"trusted":input.decision==="rejected"?"disabled":"review_required",
    updated_at:now,
  }).eq("id",request.organizer_profile_id);
  return {ok:true};
}
