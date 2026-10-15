import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
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
 runId:string;campaignId:string;items:unknown[]
}) {
 let inspected=0,photoBlocked=0,verified=0,staged=0;
 const seen=new Set<string>(),batches=new Set<string>();
 for(const raw of input.items.slice(0,50)){
   const origin=websiteLeadFromMapsItem(raw);
   if(!origin||seen.has(origin))continue;
   seen.add(origin);inspected++;
   try{
    const grant=await grantForSite(origin);
    const resolved=await resolveOfficialWebsiteLead(origin,grant);
    if(resolved.status==="needs_independent_evidence")continue;
    const candidate=resolved.candidate;
    if(!candidate)continue;
    const id=googleIdentityLead(raw);
    let photoCandidate:(IndependentBusinessProfile & {website:string;category:string;locationType:"restaurant"|"activity";zip?:string})|null=null;
    if(resolved.status==="verified_evidence")photoCandidate={...candidate,photoSource:"independent"};
    else if(id){
      // At most one metadata check per discovered lead. Do not fetch media here.
      const details=await getPlaceDetailsNew(id,{fieldMode:"address",jobKey:"li-v2-independent-business-identity"});
      if(!matchesIndependentBusiness(candidate,details,id))continue;
      const slot=await getGooglePhotoSlot(id,0);
      const url=slot?.name?googlePhotoSlotUrl(id,0,800):null;
      if(url)photoCandidate={...candidate,googlePlaceId:id,photoUrl:url,
        photoSource:"google_live",googlePhotoSlotVerified:true};
    }
    if(!photoCandidate){photoBlocked++;continue;}
    verified++;
    const saved=await stageIndependentCandidate({
      runId:input.runId,campaignId:input.campaignId,
      candidate:{...photoCandidate,category:candidate.category,
       locationType:candidate.locationType}
    });
    if(saved.staged){staged++;batches.add(saved.batchId);}
   }catch{/* malformed or unreachable lead is never promoted */}
 }
 const finalizations=[];
 for(const batchId of batches)finalizations.push(await finalizeIndependentBatch(batchId));
 return {inspected,photoBlocked,verified,staged,finalizations,
  searchV3RetrievalCertified:false};
}
