import "server-only";
import {supabaseAdmin} from "@/lib/supabase-admin";
import {assessOneTouchImport} from "./one-touch-acceptance";

/** Read-only historical audit: never re-publishes, purchases reviews, or certifies production flags. */
export async function auditIndependentFirstImports(limit=25) {
 const {data,error}=await supabaseAdmin.from("location_import_staging")
  .select("id,name,import_status,address,city,state,website,main_image,has_photos,latitude,longitude,phone,raw_payload")
  .eq("source","li_v2_independent").order("created_at",{ascending:false})
  .limit(Math.max(1,Math.min(100,Math.trunc(limit))));
 if(error)throw new Error("li_v2_import_audit_read_failed:"+error.message);
 return (data||[]).map(row=>{
  const acceptance=assessOneTouchImport(row);
  const raw=row.raw_payload && typeof row.raw_payload==="object"&&!Array.isArray(row.raw_payload)
   ?row.raw_payload as Record<string,unknown>:{};
  const profile=raw.independent_profile && typeof raw.independent_profile==="object"
   ?raw.independent_profile as Record<string,unknown>:{};
  const intel=profile.initialIntelligence && typeof profile.initialIntelligence==="object"
   ?profile.initialIntelligence as Record<string,unknown>:{};
  const fields={
   phone:typeof row.phone==="string"&&row.phone.trim().length>0,
   email:Boolean(intel.email||profile.email),
   reservationUrl:Boolean(intel.reservationUrl||profile.reservationUrl),
   socials:Boolean(intel.socialProfiles||profile.socialProfiles),
   amenities:Boolean(intel.amenities||profile.amenities),
   hours:Boolean(intel.hours||profile.hours),
  };
  return {
   id:row.id,name:row.name,publicationStatus:row.import_status,
   historicalPublicationWithoutCurrentEvidence:row.import_status==="published"&&!acceptance.oneTouchComplete,
   oneTouchComplete:acceptance.oneTouchComplete,
   required:acceptance.required,reviewStatus:acceptance.fieldAvailability.reviews,
   fields,missing:[...acceptance.missing,...Object.entries(fields).filter(([,ok])=>!ok).map(([key])=>key)],
  };
 });
}
