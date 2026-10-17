#!/usr/bin/env node
/**
 * Read-only, authenticated business-level LI V2 -> Search V3 certification.
 * Menu items and menu embeddings are not prerequisites for business search.
 * No writes, paid providers, synthetic embeddings, or publication actions.
 */
const required=["LI_E2E_SUPABASE_URL","LI_E2E_SUPABASE_SERVICE_ROLE_KEY","LI_E2E_SEARCH_URL","LI_E2E_SEARCH_BEARER_TOKEN","LI_E2E_LOCATION_ID"];
const missing=required.filter(k=>!process.env[k]?.trim());
if(missing.length)throw Error("Business Search V3 certification blocked: missing "+missing.join(", "));
const e=process.env;
if(new URL(e.LI_E2E_SUPABASE_URL).hostname!=="ftdsltatyqhtllyyefzp.supabase.co")throw Error("East primary required");
if(new URL(e.LI_E2E_SEARCH_URL).protocol!=="https:")throw Error("HTTPS Search V3 endpoint required");
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.LI_E2E_LOCATION_ID))throw Error("Invalid location UUID");
async function read(table,select,filters){
 const url=new URL("/rest/v1/"+table,e.LI_E2E_SUPABASE_URL);url.searchParams.set("select",select);
 for(const [k,v] of Object.entries(filters))url.searchParams.set(k,v);
 const response=await fetch(url,{headers:{apikey:e.LI_E2E_SUPABASE_SERVICE_ROLE_KEY,authorization:"Bearer "+e.LI_E2E_SUPABASE_SERVICE_ROLE_KEY},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error(table+" HTTP "+response.status);
 return response.json();
}
const [location]=await read("locations","id,name,import_source,import_source_id,is_searchable,has_photos,duplicate_status,public_visibility_tier",{id:"eq."+e.LI_E2E_LOCATION_ID,limit:"1"});
if(!location || location.import_source!=="li_v2_independent" || location.is_searchable!==true || location.has_photos!==true || location.public_visibility_tier==="hidden")
 throw Error("Expected published, photographed, visible LI V2 independent business missing");
if(location.duplicate_status && location.duplicate_status!=="unique")throw Error("Business duplicate status not unique");
const [staging]=await read("location_import_staging","id,import_status,source,source_id,duplicate_status",{source:"eq."+location.import_source,source_id:"eq."+location.import_source_id,import_status:"eq.published",limit:"1"});
if(!staging||staging.duplicate_status!=="unique")throw Error("Verified unique published staging record missing");
const [profile]=await read("location_intelligence_profiles_v2","location_id,search_v3_ready",{location_id:"eq."+location.id,limit:"1"});
if(profile?.search_v3_ready!==true)throw Error("LI V2 profile is not Search V3 ready");
const response=await fetch(e.LI_E2E_SEARCH_URL,{method:"POST",headers:{authorization:"Bearer "+e.LI_E2E_SEARCH_BEARER_TOKEN,"content-type":"application/json"},body:JSON.stringify({query:location.name}),signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error("Authenticated Search V3 returned HTTP "+response.status);
const payload=await response.json();
function hasExpectedBusiness(value,depth=0){
 if(depth>12||value==null)return false;
 if(Array.isArray(value))return value.some(v=>hasExpectedBusiness(v,depth+1));
 if(typeof value!=="object")return false;
 if([value.id,value.location_id,value.locationId].some(id=>id===location.id))return true;
 return Object.values(value).some(v=>hasExpectedBusiness(v,depth+1));
}
if(!hasExpectedBusiness(payload))throw Error("Authenticated Search V3 did not return expected TOH business ID");
console.log(JSON.stringify({authenticatedBusinessSearchV3Certified:true,locationId:location.id,httpStatus:response.status,menuCertification:false,paidPilotCertified:false}));
