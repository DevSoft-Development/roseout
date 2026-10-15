import "server-only";
import { resolveOfficialWebsiteLead } from "./official-website-resolver";
import { verifyWikimediaPhoto } from "./wikimedia-photo-license";
import { stageIndependentCandidate } from "./independent-staging";
import { finalizeIndependentBatch } from "./independent-batch-finalizer";

/** One authorized, free-first production bootstrap; never touches provider budgets. */
export async function bootstrapSuperiorityBurger(input:{dryRun:boolean}) {
  const website="https://www.superiorityburger.com/";
  const commons="https://commons.wikimedia.org/wiki/File:Superiority_Burger_NYC.jpg";
  const source=await resolveOfficialWebsiteLead(website);
  if(!source.candidate)
    return {ok:false,stage:"official_evidence",reason:"official_structured_business_missing"};
  const c=source.candidate;
  const normalized=(v:string|undefined)=>String(v||"").trim().toLowerCase().replace(/\s+/g," ");
  if(normalized(c.name)!=="superiority burger" || normalized(c.address)!=="119 avenue a" ||
    normalized(c.city)!=="new york" || !["ny","new york"].includes(normalized(c.state)) || c.openStatus!=="open")
    return {ok:false,stage:"identity",reason:"official_identity_or_status_mismatch"};
  const photo=await verifyWikimediaPhoto(commons);
  if(!photo)return {ok:false,stage:"photo",reason:"commons_license_not_verified"};
  if(input.dryRun)return {ok:true,dryRun:true,name:c.name,address:c.address,photoSource:photo.filePageUrl};
  const runId="single-location-certification-20261015";
  const campaignId="li-v2-bootstrap-superiority-20261015";
  const staged=await stageIndependentCandidate({runId,campaignId,candidate:{
    ...c,photoUrl:photo.imageUrl,photoSource:"wikimedia_commons",
    wikimediaFilePageUrl:photo.filePageUrl,category:"restaurant",locationType:"restaurant",
  }});
  if(!staged.staged || !staged.batchId)return {ok:false,stage:"staging",reasons:"reasons" in staged ? staged.reasons : ["stage_rejected"]};
  const finalized=await finalizeIndependentBatch(staged.batchId);
  const locationIds=[...finalized.readyLocationIds,...finalized.needsReadiness];
  if(locationIds.length===0)
    return {ok:false,dryRun:false,stage:"publication",reason:"no_published_location",batchId:staged.batchId,
      searchV3RetrievalCertified:false};
  return {ok:true,dryRun:false,batchId:staged.batchId,staged:true,
    readyLocationIds:finalized.readyLocationIds,needsReadiness:finalized.needsReadiness,
    searchV3RetrievalCertified:false};
}
