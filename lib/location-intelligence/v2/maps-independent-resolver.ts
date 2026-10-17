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
/** Licensed Maps output can be the primary source for business identity. Keep proof of origin. */
export function licensedBusinessLead(value:unknown,origin:string): (IndependentBusinessProfile & {
 website:string;category:string;locationType:"restaurant"|"activity";zip?:string
})|null {
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const item=value as Record<string,unknown>;
 const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
 const addr=obj(item.address_info), clean=(v:unknown)=>typeof v==="string"?v.trim():"";
 const name=clean(item.title)||clean(item.name);
 const address=clean(addr.address)||clean(item.address);
 const city=clean(addr.city)||clean(item.city);
 const state=clean(addr.region)||clean(addr.state)||clean(item.state);
 const zip=clean(addr.zip)||clean(item.zip);
 const category=clean(item.category)||clean(item.category_name)||"restaurant";
 const status=clean(item.business_status).toLowerCase();
 // Unknown, temporarily closed and permanently closed businesses never auto-publish.
 const openStatus=status==="open"||status==="operational"||status==="opened"?"open":"unknown";
 if(!name||!address||!city||!state||!origin)return null;
 const activity=/activity|museum|park|attraction|theater|theatre|nightclub|entertainment/i.test(category);
 return {name,address,city,state,zip,website:origin,sourceUrl:origin,
   category,locationType:activity?"activity":"restaurant",
   evidenceSource:"licensed_dataset",openStatus};
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
 // Preserve non-content lead references *before* any network verification begins.
 // Do not persist DataForSEO Maps names, addresses, reviews, or full payloads.
 // Existing audit identities are never reset on replays.
 const intake=input.items.slice(0,50).map(raw=>({
   run_id:input.runId,
   candidate_key:createHash("sha256").update(JSON.stringify(raw)??"null").digest("hex"),
   website_origin:websiteLeadFromMapsItem(raw),
   status:"pending_review",reason:"awaiting_independent_verification"
 }));
 const uniqueIntake=[...new Map(intake.map(row=>[row.candidate_key,row])).values()];
 if(uniqueIntake.length){
   const {error:intakeError}=await supabaseAdmin.from("li_v2_candidate_audit")
     .upsert(uniqueIntake,{onConflict:"run_id,candidate_key",ignoreDuplicates:true});
   if(intakeError)throw new Error("li_v2_lead_intake_failed:"+intakeError.message);
 }
 const seen=new Set<string>(),batches=new Set<string>();
 for(const raw of input.items.slice(0,50)){
   const origin=websiteLeadFromMapsItem(raw);
   if(!origin){mark(raw,null,'rejected','official_website_missing');continue;}
   if(seen.has(origin)){mark(raw,origin,'rejected','duplicate_website_lead');continue;}
   seen.add(origin);inspected++;
   try{
    failureStage="photo_grant";
    // Grants are optional for acquisition; a lookup failure must never block verified business staging.
    const grant=await grantForSite(origin).catch(()=>undefined);
    failureStage="official_site";
    const licensed=licensedBusinessLead(raw,origin);
    const resolved=licensed?null:await resolveOfficialWebsiteLead(origin,grant);
    if(!licensed && resolved?.status==="needs_independent_evidence"){mark(raw,origin,"pending_review",resolved.reason);continue;}
    let candidate=licensed || resolved?.candidate;
    if(licensed && grant){
      // A grant is only a photo permission; validate its website origin before using it.
      const {permittedOfficialPhoto}=await import("./official-website-resolver");
      const photo=permittedOfficialPhoto(grant,origin);
      if(photo)candidate={...licensed,photoUrl:photo.photoUrl,photoPermission:photo.photoPermission,photoSource:"independent"};
    }
    if(!candidate){mark(raw,origin,"rejected","independent_candidate_missing");continue;}
    const id=googleIdentityLead(raw);
    // One shared per-candidate Google details call can serve both operating-status
    // verification and primary-photo identity confirmation. Never exceed the
    // existing bounded Google lookup allowance, including bootstrap's limit of 1.
    let matchedGoogleDetails:Awaited<ReturnType<typeof getPlaceDetailsNew>>|null=null;
    if(candidate.openStatus!=="open" && licensed && id &&
       googlePhotoLookups < (input.maxGooglePhotoLookups ?? 50)){
      failureStage="google_identity";
      const {data:assigned,error:lookupError}=await supabaseAdmin.from("locations")
        .select("id").eq("google_place_id",id).limit(1);
      if(lookupError)throw new Error("google_identity_lookup_failed:"+lookupError.message);
      if(assigned?.length){mark(raw,origin,"rejected","existing_google_identity");continue;}
      googlePhotoLookups++;
      failureStage="google_status";
      const details=await getPlaceDetailsNew(id,{fieldMode:"rich",jobKey:"li-v2-independent-business-identity"})
        .catch(()=>null);
      if(details && matchesIndependentBusiness(candidate,details,id)){
        matchedGoogleDetails=details;
        if(details.businessStatus==="OPERATIONAL") candidate={...candidate,openStatus:"open"};
        else if(details.businessStatus==="CLOSED_TEMPORARILY" ||
                details.businessStatus==="CLOSED_PERMANENTLY"){
          mark(raw,origin,"pending_review","google_business_closed");continue;
        }
      }
    }
    if(candidate.openStatus!=="open" && licensed){
      // Provider unknown is not proof of closure. Fail closed unless the
      // official website corroborates an exact business identity and hours.
      failureStage="official_status";
      const proof=await resolveOfficialWebsiteLead(origin,grant).catch(()=>null);
      const verified=proof?.candidate;
      const normalized=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,"");
      const sameIdentity=verified && normalized(verified.name||"")===normalized(candidate.name||"") &&
        normalized(verified.address||"")===normalized(candidate.address||"") &&
        normalized(verified.city||"")===normalized(candidate.city||"");
      if(sameIdentity && verified.openStatus==="open")
        candidate={...candidate,openStatus:"open"};
    }
    if(candidate.openStatus!=="open"){mark(raw,origin,"pending_review","operating_status_unverified");continue;}
    let photoCandidate:(IndependentBusinessProfile & {website:string;category:string;locationType:"restaurant"|"activity";zip?:string})|null=null;
    const candidatePhoto=candidate as IndependentBusinessProfile & typeof candidate;
    if(candidatePhoto.photoUrl && candidatePhoto.photoPermission)photoCandidate={...candidatePhoto,photoSource:"independent"};
    else {
      failureStage="wikimedia";
      const licensed=await discoverVerifiedWikimediaBusinessPhoto({
        name:candidate.name||"",address:candidate.address||"",
        city:candidate.city||"",state:candidate.state||"",
      }).catch(()=>null);
      if(licensed)photoCandidate={...candidate,photoUrl:licensed.imageUrl,
        photoSource:"wikimedia_commons",wikimediaFilePageUrl:licensed.filePageUrl};
    }
    if(!photoCandidate && id && (matchedGoogleDetails || googlePhotoLookups < (input.maxGooglePhotoLookups ?? 50))){
      // Free-first: reject any ID already attached to a TOH record before billed Google details.
      // A shared venue ID is NOT proof these businesses are duplicates.
      failureStage="google_identity";
      const {data:assigned,error:lookupError}=await supabaseAdmin.from("locations")
        .select("id").eq("google_place_id",id).limit(1);
      if(lookupError)throw new Error("google_identity_lookup_failed:"+lookupError.message);
      if(assigned?.length){photoBlocked++;mark(raw,origin,"rejected","existing_google_identity");continue;}
      // Only unresolved identities needing a Google live photo can reach this billed check.
      if(!matchedGoogleDetails)googlePhotoLookups++;
      failureStage="google_details";
      const details=matchedGoogleDetails || await getPlaceDetailsNew(id,{fieldMode:"rich",jobKey:"li-v2-independent-business-identity"});
      if(!matchesIndependentBusiness(candidate,details,id)){mark(raw,origin,"rejected","google_identity_mismatch");continue;}
      failureStage="google_slot";
      const slot=await getGooglePhotoSlot(id,0);
      const url=slot?.name?googlePhotoSlotUrl(id,0,800):null;
      if(url)photoCandidate={...candidate,googlePlaceId:id,photoUrl:url,
        photoSource:"google_live",googlePhotoSlotVerified:true};
    }
    // Every imported business must have one usable, business-specific primary photo.
    // Keep unresolved leads in review rather than staging photo-less records.
    if(!photoCandidate){
      photoBlocked++;
      mark(raw,origin,"pending_review",id ? "approved_primary_photo_unavailable" : "approved_primary_photo_unavailable_no_google_identity");
      continue;
    }
    verified++;
    failureStage="staging";
    const saved=await stageIndependentCandidate({
      runId:input.runId,campaignId:input.campaignId,
      candidate:{...photoCandidate,googlePlaceId:photoCandidate.googlePlaceId||undefined,category:candidate.category,
       locationType:candidate.locationType}
    });
    if(saved.staged){staged++;if(!saved.photoPending)batches.add(saved.batchId);mark(raw,origin,"staged",saved.photoPending?"independent_photo_pending_staged":"independent_stage_accepted");}
    else mark(raw,origin,"pending_review",saved.reasons?.[0]==="independent_geocode_not_confirmed"
      ? ["independent_geocode_not_confirmed",...saved.reasons.slice(1)].join(":").slice(0,120)
      : saved.reasons?.[0]||"independent_stage_rejected");
   }catch(error){mark(raw,origin,"pending_review",error instanceof Error && /^photo_grant_lookup_failed/.test(error.message)?"photo_grant_lookup_failed":"candidate_resolution_error_"+failureStage); }
 }
 if(audits.length){
   const uniqueAudits=[...new Map(audits.map(a=>[a.candidate_key,a])).values()];
   const {error:auditError}=await supabaseAdmin.from("li_v2_candidate_audit").upsert(uniqueAudits,{onConflict:"run_id,candidate_key"});
   if(auditError)throw new Error("li_v2_candidate_audit_write_failed:"+auditError.message);
 }
 const finalizations=[];
 for(const batchId of batches)finalizations.push(await finalizeIndependentBatch(batchId));
 return {acquired:uniqueIntake.length,inspected,photoBlocked,verified,staged,googlePhotoLookups,reasons,finalizations,
  searchV3RetrievalCertified:false};
}
