import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Checks only customer-visible results; never claims authenticated Search V3 lane provenance. */
type Check={location_id:string;status:"pending"|"verified"|"quarantined";attempts:number;due:boolean;name:string|null;city:string|null;location_type:string|null;is_searchable:boolean};
const endpoint="https://theouthaven.com/api/explore/search";

async function snapshot(runId:string,index:number):Promise<Check[]> {
 const {data,error}=await supabaseAdmin.rpc("li_v2_retrieval_snapshot",{p_run_id:runId,p_index:index});
 if(error||!Array.isArray(data))throw new Error("consumer_certification_snapshot_failed");
 return data as Check[];
}
export async function registerConsumerChecks(runId:string,index:number,ids:string[]) {
 if(!ids.length)throw new Error("no_published_locations_to_certify");
 const {data,error}=await supabaseAdmin.rpc("li_v2_retrieval_register",{p_run_id:runId,p_index:index,p_ids:[...new Set(ids)]});
 if(error)throw new Error("consumer_certification_registration_failed:"+error.message);
 if(typeof data!=="number"||data<1)throw new Error("no_authorized_locations_registered");
 return data;
}
async function verifyOne(row:Check) {
 if(!row.is_searchable||!row.name?.trim())return {found:false,reason:"not_searchable_or_missing_name"};
 try{
  const url=new URL(endpoint);
  url.searchParams.set("q",row.name.trim());
  url.searchParams.set("kind",row.location_type==="restaurant"?"restaurants":"activities");
  url.searchParams.set("limit","96");
  const response=await fetch(url,{headers:{accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(!response.ok)return {found:false,reason:"search_http_"+response.status};
  const json=await response.json();
  if(json?.success!==true)return {found:false,reason:"consumer_search_reported_failure"};
  if(!Array.isArray(json?.items))return {found:false,reason:"consumer_search_invalid_items"};
  const items=json.items;
  const found=items.some((item:any)=>[item?.id,item?.location_id,item?.locationId].includes(row.location_id));
  return {found,reason:found?"verified":"location_not_in_consumer_results"};
 }catch{return {found:false,reason:"consumer_search_unavailable"};}
}
export async function advanceConsumerChecks(runId:string,index:number) {
 const before=await snapshot(runId,index);
 if(!before.length)return {state:"unregistered" as const,verified:0,quarantined:0,pending:0};
 for(const row of before.filter(x=>x.status==="pending"&&x.due).slice(0,10)){
  // Do not exhaust retrieval attempts while the internal publication/indexing
  // prerequisites have not completed; only real consumer probes count.
  if (!row.is_searchable || !row.name?.trim()) continue;
  const result=await verifyOne(row);
  const {data,error}=await supabaseAdmin.rpc("li_v2_retrieval_record",{
   p_run_id:runId,p_index:index,p_location_id:row.location_id,p_found:result.found,p_error:result.found?null:result.reason
  });
  if(error||data!==true)throw new Error("consumer_certification_record_failed");
 }
 const after=await snapshot(runId,index);
 const pending=after.filter(x=>x.status==="pending").length;
 const verified=after.filter(x=>x.status==="verified").length;
 const quarantined=after.filter(x=>x.status==="quarantined").length;
 return {state:pending?"waiting" as const:"complete" as const,pending,verified,quarantined};
}
