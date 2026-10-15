import "server-only";
import {createHash} from "node:crypto";\nimport {verifyWikimediaPhoto} from "./wikimedia-photo-license";
import {supabaseAdmin} from "@/lib/supabase-admin";
import {getCredentialVaultProviderValues} from "@/lib/admin/credential-vault-runtime-source";
import {geocodeFreeFirst} from "@/lib/location-intelligence/v2/free-geocoding";
import {assessIndependentBusinessProfile, type IndependentBusinessProfile} from "./independent-profile-gate";
import {calculateStagingQuality} from "@/lib/location-growth/stagingQuality";

type Candidate=IndependentBusinessProfile&{
  website?:string;googlePlaceId?:string;category:string;
  locationType:"restaurant"|"activity";zip?:string;
};
function distanceM(a:number,b:number,c:number,d:number){
 const r=Math.PI/180,dy=(c-a)*r,dx=(d-b)*r;
 const t=Math.sin(dy/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(dx/2)**2;
 return 12742000*Math.asin(Math.sqrt(Math.min(1,t)));
}
/** Accept only independently sourced, photographed and geocoded business evidence. */
export async function stageIndependentCandidate(input:{
 campaignId:string;runId:string;candidate:Candidate
}) {
 let p=input.candidate;\n let wikimediaEvidence = null;\n if(p.photoSource==="wikimedia_commons"){\n   wikimediaEvidence=p.wikimediaFilePageUrl ? await verifyWikimediaPhoto(p.wikimediaFilePageUrl) : null;\n   if(!wikimediaEvidence || p.photoUrl!==wikimediaEvidence.imageUrl)\n     return {staged:false,reasons:["wikimedia_license_or_url_unverified"]};\n   p={...p,photoPermission:"licensed",photoUrl:wikimediaEvidence.imageUrl};\n }
 const values=await getCredentialVaultProviderValues("geoapify").catch(()=>({apiKey:""}));
 const location=await geocodeFreeFirst({
   street:p.address!,city:p.city!,state:p.state!,zip:p.zip,
 },{geoapifyKey:String(values.apiKey||"")});
 if(!location)return {staged:false,reasons:["independent_geocode_not_confirmed"]};
 if(p.latitude!==undefined && p.longitude!==undefined &&
   distanceM(location.latitude,location.longitude,p.latitude,p.longitude)>500)
   return {staged:false,reasons:["independent_location_coordinate_disagreement"]};
 const verified={...p,latitude:location.latitude,longitude:location.longitude};
 const verdict=assessIndependentBusinessProfile(verified);
 if(!verdict.publishable)return {staged:false,reasons:verdict.reasons};
 const identifier=(p.googlePlaceId&&/^[A-Za-z0-9_-]{8,255}$/.test(p.googlePlaceId))
   ?p.googlePlaceId:createHash("sha256").update(
     [p.name,p.address,p.city,p.state].join("|").toLowerCase()).digest("hex");
 // Final publisher rechecks duplicates across live TOH identities.
 const {data:existing,error:existsError}=await supabaseAdmin.from("locations")
   .select("id").eq("google_place_id",identifier).limit(1);
 if(existsError)throw existsError;
 if(existing?.length)return {staged:false,reasons:["existing_google_identity"]};
 const source="li_v2_independent";
 const label="LI V2 verified "+input.campaignId+" "+input.runId;
 const {data:prior,error:priorError}=await supabaseAdmin.from("location_import_batches")
  .select("id").eq("source",source).eq("source_label",label).limit(1);
 if(priorError)throw priorError;
 const {data:batch,error:batchError}=prior?.length?{data:prior[0],error:null}
  :await supabaseAdmin.from("location_import_batches").insert({
    source,source_label:label,status:"staging",
    metadata:{campaign_id:input.campaignId,run_id:input.runId}
  }).select("id").single();
 if(batchError||!batch)throw new Error("independent_import_batch_creation_failed");
 const primaryPhoto=p.photoUrl!.trim();
 // Import a single primary photo only. Gallery photos are loaded on demand on profile views.
 const base={
   batch_id:batch.id,source,source_id:identifier,source_url:p.sourceUrl,
   location_type:p.locationType,name:p.name,address:p.address,city:p.city,
   state:p.state,zip_code:p.zip||null,website:p.website||null,
   latitude:location.latitude,longitude:location.longitude,
   primary_category:p.category,main_image:primaryPhoto,images:[primaryPhoto],
   has_photos:true,photo_status:p.photoSource==="google_live"?"google_photo":"imported_photo",
   duplicate_status:"unchecked",
   import_status:"staged",source_quality_status:"independently_verified",
   import_confidence:"high",
   raw_payload:{campaign_id:input.campaignId,run_id:input.runId,
     independent_profile:{googlePlaceId:p.googlePlaceId||null,evidenceSource:p.evidenceSource,
       photoPermission:p.photoPermission||null,
       photoSource:p.photoSource||"independent",
       googlePhotoSlotVerified:p.googlePhotoSlotVerified===true,
       photoStrategy:"primary_only_gallery_on_demand",\n       wikimediaEvidence,
       openStatus:p.openStatus,
       geocodeProvider:location.provider,geoPrecision:location.precision,
       matchedAddress:location.matchedAddress}},
 };
 const scored=calculateStagingQuality(base);
 const {error:stageError}=await supabaseAdmin.from("location_import_staging")
  .upsert({...base,...scored},{onConflict:"source,source_id",ignoreDuplicates:true});
 if(stageError)throw new Error("independent_stage_failed:"+stageError.message);
 return {staged:true,batchId:batch.id,qualityStatus:scored.quality_status,sourceId:identifier};
}
