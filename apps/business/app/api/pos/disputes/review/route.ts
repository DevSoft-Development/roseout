import {createHash} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase-server";
import {getLocationOwnerAccess} from "@/lib/auth/locationOwnerAccess";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";
import {preparePosDisputeManifest} from "@/lib/pos/payments/dispute-packet";
import {stripeRequest} from "@/lib/stripe/server";
export const runtime="nodejs";export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={"Cache-Control":"private, no-store"};
const fail=(status:number,error:string)=>NextResponse.json({error},{status,headers});
export async function POST(req:NextRequest){
 if(process.env.POS_DISPUTE_MANAGER_APPROVAL_ENABLED!=="true")return fail(503,"dispute_review_not_certified");
 const origin=req.headers.get("origin");
 if(!origin||origin!==new URL(req.url).origin)return fail(403,"invalid_origin");
 let body:{locationId?:string;disputeId?:string;action?:"approve"|"submit";sha256?:string};
 try{
  const raw=await req.text();
  if(raw.length>4096)return fail(413,"payload_too_large");
  body=JSON.parse(raw);
 }catch{return fail(400,"invalid_payload");}
 if(!body||!UUID.test(String(body.locationId||""))||!UUID.test(String(body.disputeId||""))||
 !["approve","submit"].includes(body.action||"")||!/^[a-f0-9]{64}$/.test(String(body.sha256||"")))
  return fail(400,"invalid_review");
 const auth=await createClient();const {data:{user}}=await auth.auth.getUser();
 if(!user)return fail(401,"unauthorized");
 const access=await getLocationOwnerAccess(user.id,user.email);
 if(!access.isSuperadmin&&!access.ownedLocationIds.includes(String(body.locationId)))return fail(403,"forbidden");
 try{
  const locationId=String(body.locationId);
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"write"});
  const record=await shard.client.from("pos_dispute_cases")
   .select("id,tender_id,provider_dispute_id,connected_account_id,status,evidence_due_at,submitted_at")
   .eq("location_id",locationId).eq("id",body.disputeId).maybeSingle();
  if(record.error||!record.data||record.data.submitted_at)return fail(409,"dispute_unavailable");
  const dispute=record.data;
  if(dispute.evidence_due_at&&Date.parse(dispute.evidence_due_at)<=Date.now())return fail(409,"evidence_deadline_expired");
  const manifest=await preparePosDisputeManifest(locationId,dispute.tender_id);
  const digest=createHash("sha256").update(JSON.stringify({...manifest,generatedAt:null})).digest("hex");
  // Evidence packets contain generation times. Use the reviewed snapshot hash
  // supplied during preparation only if an exact matching stored audit exists.
  if(body.action==="approve"){
   const prepared=await shard.client.from("pos_dispute_review_events").select("id")
    .eq("location_id",locationId).eq("dispute_id",dispute.id).eq("action","prepare")
    .eq("evidence_sha256",body.sha256).limit(1);
   if(prepared.error||!prepared.data?.length)return fail(409,"evidence_not_prepared");
   const saved=await shard.client.from("pos_dispute_review_events").insert({
    location_id:locationId,dispute_id:dispute.id,actor_user_id:user.id,
    action:"approve",evidence_sha256:body.sha256
   });
   if(saved.error)return fail(503,"review_audit_unavailable");
   return NextResponse.json({ok:true,approved:true},{headers});
  }
  if(process.env.POS_DISPUTE_STRIPE_SUBMISSION_ENABLED!=="true")return fail(503,"dispute_submission_not_certified");
  const approved=await shard.client.from("pos_dispute_review_events").select("id")
   .eq("location_id",locationId).eq("dispute_id",dispute.id)
   .eq("action","approve").eq("evidence_sha256",body.sha256).limit(1);
  if(approved.error||!approved.data?.length)return fail(403,"manager_approval_required");
  // Only certified sandbox submissions. A separate production release must
  // explicitly audit mode, connected account, dispute evidence and authorization.
  if(process.env.POS_DISPUTE_SUBMISSION_MODE!=="test")return fail(503,"sandbox_only");
  const form=new URLSearchParams();
  const summary="Transaction "+manifest.tenderId+"; "+manifest.items.length+
   " item lines; recorded processor reference "+
   (manifest.payments[0]?.provider_payment_intent_id||"unavailable")+
   ". Transaction and receipt evidence retained by location.";
  form.set("evidence[uncategorized_text]",summary.slice(0,15000));
  form.set("submit","true");
  const audit=await shard.client.from("pos_dispute_review_events").insert({
   location_id:locationId,dispute_id:dispute.id,actor_user_id:user.id,
   action:"submit",evidence_sha256:body.sha256
  });
  if(audit.error)return fail(503,"submission_audit_unavailable");
  const submitted=await stripeRequest<{id:string,status:string}>(`/disputes/${encodeURIComponent(dispute.provider_dispute_id)}`,{
   method:"POST",body:form,stripeAccount:dispute.connected_account_id,mode:"test",
   idempotencyKey:`pos-dispute-submit-${dispute.id}-${body.sha256}`
  });
  if(submitted.id!==dispute.provider_dispute_id)throw Error("dispute_submission_response_mismatch");
  const saved=await shard.client.from("pos_dispute_cases")
   .update({submitted_at:new Date().toISOString(),status:submitted.status,updated_at:new Date().toISOString()})
   .eq("id",dispute.id).eq("location_id",locationId).is("submitted_at",null);
  if(saved.error)throw Error("dispute_submission_reconcile_failed");
  return NextResponse.json({ok:true,submitted:true,status:submitted.status},{headers});
 }catch{return fail(503,"dispute_service_unavailable");}
}
