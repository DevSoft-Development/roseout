#!/usr/bin/env node
/**
 * Real imported business -> Search V3 / cost certification.
 * Read-only. Never creates businesses, makes paid provider calls, or alters budgets.
 * Exits nonzero when there is no real, newly imported and indexed candidate.
 */
const names=[
 "LI_E2E_SUPABASE_URL","LI_E2E_SUPABASE_SERVICE_ROLE_KEY",
 "LI_E2E_SEARCH_URL","LI_E2E_SEARCH_BEARER_TOKEN",
 "LI_E2E_LOCATION_ID","LI_E2E_CAMPAIGN_ID"
];
const missing=names.filter(n=>!process.env[n]?.trim());
if(missing.length)throw Error("Acquisition E2E blocked: missing "+missing.join(","));
const e=process.env;
if(new URL(e.LI_E2E_SUPABASE_URL).hostname!=="ftdsltatyqhtllyyefzp.supabase.co")
 throw Error("Acquisition E2E must verify production East primary");
if(new URL(e.LI_E2E_SEARCH_URL).protocol!=="https:")
 throw Error("Search endpoint must use HTTPS");
if(!/^[0-9a-f-]{36}$/i.test(e.LI_E2E_LOCATION_ID))throw Error("Invalid real location ID");
async function rest(path,filters){
 const url=new URL("/rest/v1/"+path,e.LI_E2E_SUPABASE_URL);
 for(const [key,value] of Object.entries(filters||{}))url.searchParams.set(key,value);
 const res=await fetch(url,{headers:{apikey:e.LI_E2E_SUPABASE_SERVICE_ROLE_KEY,
   authorization:"Bearer "+e.LI_E2E_SUPABASE_SERVICE_ROLE_KEY},
   signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error(path+" query returned HTTP "+res.status);
 return res.json();
}
const [location]=await rest("locations",{
 select:"id,name,import_source,import_source_id,is_searchable,has_photos,duplicate_status,quality_status,public_visibility_tier",
 id:"eq."+e.LI_E2E_LOCATION_ID,limit:"1"
});
if(!location||!String(location.import_source).startsWith("li_v2_")||
 location.is_searchable!==true||location.has_photos!==true||
 location.duplicate_status!=="unique"||location.public_visibility_tier==="hidden")
 throw Error("Imported location is not verified, unique, photographed and searchable");
const [stage]=await rest("location_import_staging",{
 select:"id,source,source_id,raw_payload,import_status",
 source:"eq."+location.import_source,source_id:"eq."+location.import_source_id,
 import_status:"eq.published",limit:"1"
});
const independent=stage?.raw_payload?.independent_profile;
if(!stage||stage.raw_payload?.campaign_id!==e.LI_E2E_CAMPAIGN_ID||
 !["owner","licensed","public_domain"].includes(independent?.photoPermission)||
 !["owner","official_website","licensed_dataset"].includes(independent?.evidenceSource))
 throw Error("Independent campaign profile provenance or photo rights not certified");
const [profile]=await rest("location_intelligence_profiles_v2",{
 select:"location_id,search_v3_ready",location_id:"eq."+location.id,limit:"1"
});
if(profile?.search_v3_ready!==true)throw Error("Location Intelligence profile not Search V3-ready");
const [cost]=await rest("rpc/li_v2_campaign_financial_snapshot",{},{
});
