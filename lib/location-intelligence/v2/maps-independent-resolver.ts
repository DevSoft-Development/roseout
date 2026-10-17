import { createHash } from "node:crypto";
import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { discoverVerifiedWikimediaBusinessPhoto } from "./wikimedia-photo-license";
import { resolveOfficialWebsiteLead, type PhotoGrant } from "./official-website-resolver";
import { getGooglePhotoSlot } from "@/lib/google/place-photo-slots";
import { getPlaceDetailsNew } from "@/lib/google/places-new-client";
import { matchesIndependentBusiness } from "./google-business-identity-match";
import { googlePhotoSlotUrl } from "@/lib/locations/photo-public";
import type { IndependentBusinessProfile } from "./independent-profile-gate";
import { stageIndependentCandidate } from "./independent-staging";
import { finalizeIndependentBatch } from "./independent-batch-finalizer";

const forbidden=/(^|\.)(google\.com|google\.[a-z.]+|maps\.google\.com|dataforseo\.com)$/i;
export function websiteLeadFromMapsItem(value:unknown):string|null {
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const item=value as Record<string,unknown>;
 for(const raw of [item.domain,item.website,item.url]){
  if(typeof raw!=="string"||!raw.trim())continue;
  try{
   const url=new URL(raw.startsWith("http")?raw:"https://"+raw);
   if(url.protocol!=="https:"||url.username||url.password||forbidden.test(url.hostname)||
      url.hostname==="localhost"||!url.hostname.includes("."))continue;
   return url.origin;
  }catch{/* malformed search lead */}
 }
 return null;
}
async function grantForSite(origin:string):Promise<PhotoGrant|undefined> {
 const {data,error}=await supabaseAdmin.from("li_v2_photo_grants")
  .select("website_origin,image_url,evidence_url,permission,verified_by,expires_at")
  .eq("website_origin",origin).eq("active",true).limit(1).maybeSingle();
 if(error)throw new Error("photo_grant_lookup_failed:"+error.message);
 if(!data)return undefined;
 return {websiteOrigin:String(data.website_origin),imageUrl:String(data.image_url),
  evidenceUrl:String(data.evidence_url),permission:data.permission as PhotoGrant["permission"],
  verifiedBy:String(data.verified_by),expiresAt:data.expires_at||undefined};
}
/** Provider IDs are used for identity/photo lookup, never as source facts. */
export function googleIdentityLead(value:unknown):string|null {
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const item=value as Record<string,unknown>;
 for(const key of ["place_id","placeId","google_place_id"]){
   const id=String(item[key]||"").trim();
   if(/^[A-Za-z0-9_-]{8,255}$/.test(id))return id;
 }
 return null;
}
/** Maps output supplies leads only; official website independently supplies business facts. */
export async function resolveQueuedMapsToIndependentProfiles(input:{
 runId:string;campaignId:string;items:unknown[];maxGooglePhotoLookups?:number
}) {
 let inspected=0,photoBlocked=0,verified=0,staged=0,googlePhotoLookups=0;
 let failureStage="website";
 const audits:{run_id:string;candidate_key:string;website_origin:string|null;status:string;reason:string}[]=[];
 const reasons:Record<string,number>={};
 const mark=(raw:unknown,origin:string|null,status:string,reason:string)=>{
   reasons[reason]=(reasons[reason]||0)+1;
   const candidate_key=createHash('sha256').update(JSON.stringify(raw)??'null').digest('hex');
   audits.push({run_id:input.runId,candidate_key,website_origin:origin,status,reason});
 };
 const seen=new Set<string>(),batches=new Set<string>();
 for(const raw of input.items.slice(0,50)){
   const origin=websiteLeadFromMapsItem(raw);
   if(!origin){mark(raw,null,'rejected','official_website_missing');continue;}
   if(seen.has(origin)){mark(raw,origin,'rejected','duplicate_website_lead');continue;}
   seen.add(origin);inspected++;
   try{
    failureStage="photo_grant";
    const grant=await grantForSite(origin);
    failureStage="official_site";
    const resolved=await resolveOfficialWebsiteLead(origin,grant);
    if(resolved.status==="needs_independent_evidence"){mark(raw,origin,"pending_review",resolved.reason);continue;}
    const candidate=resolved.candidate;
    if(!candidate){mark(raw,origin,"rejected","independent_candidate_missing");continue;}
    const id=googleIdentityLead(raw);
    let photoCandidate:(IndependentBusinessProfile & {website:string;category:string;locationType:"restaurant"|"activity";zip?:string})|null=null;
    if(resolved.status==="verified_evidence")photoCandidate={...candidate,photoSource:"independent"};
    else if(resolved.status==="needs_photo_permission"){
      failureStage="wikimedia";
      const licensed=await discoverVerifiedWikimediaBusinessPhoto({
        name:candidate.name||"",address:candidate.address||"",
        city:candidate.city||"",state:candidate.state||"",
      });
      if(licensed)photoCandidate={...candidate,photoUrl:licensed.imageUrl,
        photoSource:"wikimedia_commons",wikimediaFilePageUrl:licensed.filePageUrl};
    }
    if(!photoCandidate && id && googlePhotoLookups < (input.maxGooglePhotoLookups ?? 50)){
      // Free-first: reject any ID already attached to a TOH record before billed Google details.
      // A shared venue ID is NOT proof these businesses are duplicates.
      failureStage="google_identity";
      const {data:assigned,error:lookupError}=await supabaseAdmin.from("locations")
        .select("id").eq("google_place_id",id).limit(1);
      if(lookupError)throw new Error("google_identity_lookup_failed:"+lookupError.message);
      if(assigned?.length){photoBlocked++;mark(raw,origin,"rejected","existing_google_identity");continue;}
      // Only unresolved identities needing a Google live photo can reach this billed check.
      googlePhotoLookups++;
      failureStage="google_details";
      const details=await getPlaceDetailsNew(id,{fieldMode:"rich",jobKey:"li-v2-independent-business-identity"});
      if(!matchesIndependentBusiness(candidate,details,id)){mark(raw,origin,"rejected","google_identity_mismatch");continue;}
      failureStage="google_slot";
      const slot=await getGooglePhotoSlot(id,0);
      const url=slot?.name?googlePhotoSlotUrl(id,0,800):null;
      if(url)photoCandidate={...candidate,googlePlaceId:id,photoUrl:url,
        photoSource:"google_live",googlePhotoSlotVerified:true};
    }
    // A missing approved photo must not discard independently verified business facts.
    // Staging records remain photo-pending and are NOT eligible for consumer publication.
    if(!photoCandidate){photoBlocked++;photoCandidate={...candidate};}
    else verified++;
    failureStage="staging";
    const saved=await stageIndependentCandidate({
      runId:input.runId,campaignId:input.campaignId,
      candidate:{...photoCandidate,category:candidate.category,
       locationType:candidate.locationType}
    });
    if(saved.staged){staged++;batches.add(saved.batchId);mark(raw,origin,"staged",photoCandidate.photoUrl?"independent_stage_accepted":"independent_stage_photo_pending");}
    else mark(raw,origin,"pending_review",saved.reasons?.[0]||"independent_stage_rejected");
   }catch(error){mark(raw,origin,"pending_review",error instanceof Error && /^photo_grant_lookup_failed/.test(error.message)?"photo_grant_lookup_failed":"candidate_resolution_error_"+failureStage); }
 }
 if(audits.length){
   const uniqueAudits=[...new Map(audits.map(a=>[a.candidate_key,a])).values()];
   const {error:auditError}=await supabaseAdmin.from("li_v2_candidate_audit").upsert(uniqueAudits,{onConflict:"run_id,candidate_key"});
   if(auditError)throw new Error("li_v2_candidate_audit_write_failed:"+auditError.message);
 }
 const finalizations=[];
 for(const batchId of batches)finalizations.push(await finalizeIndependentBatch(batchId));
 return {inspected,photoBlocked,verified,staged,googlePhotoLookups,reasons,finalizations,
  searchV3RetrievalCertified:false};
}
