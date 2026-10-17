import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dedupeStagedLocationsChunk } from "@/lib/location-growth/dedupeStaging";
import { publishReadyStagedLocations } from "@/lib/location-growth/publishReady";
import { refreshLocationClassificationV2 } from "@/lib/location-intelligence/v2/classification";
import { refreshLocationReadiness } from "@/lib/location-intelligence/v2/readiness";

/** Completion for independently licensed acquisition candidates only.
 * Never interprets SERP results as license to retain or publish business data.
 */
export async function finalizeIndependentBatch(batchId:string) {
 if(!/^[0-9a-f-]{36}$/i.test(batchId))throw new Error("independent_batch_id_invalid");
 const {data:batch,error:batchError}=await supabaseAdmin.from("location_import_batches")
   .select("id,source").eq("id",batchId).single();
 if(batchError||batch?.source!=="li_v2_independent")
   throw new Error("independent_batch_not_authorized");
 const dedupe=await dedupeStagedLocationsChunk({batchId,limit:50});
 // Publisher enforces independent provenance and photo rights at final insert.
 const published=await publishReadyStagedLocations({batchId,limit:20});
 if(published.errors.length)throw new Error("independent_publish_failed");
 const {data:staged,error:stagedError}=await supabaseAdmin.from("location_import_staging")
   .select("source_id,source,import_status").eq("batch_id",batchId).eq("import_status","published")
   .limit(100);
 if(stagedError)throw new Error("independent_stage_status_read_failed");
 const sourceIds=(staged||[]).map(x=>String(x.source_id||"")).filter(Boolean);
 const {data:locations,error:locationError}=sourceIds.length
   ?await supabaseAdmin.from("locations")
      .select("id,import_source_id,is_searchable,has_photos").eq("import_source","li_v2_independent")
      .in("import_source_id",sourceIds)
   :{data:[],error:null};
 if(locationError)throw new Error("independent_published_location_lookup_failed");
 const verified:string[]=[];
 const incomplete:string[]=[];
 for(const location of locations||[]){
   const id=String(location.id);
   await refreshLocationClassificationV2(id);
   const result=await refreshLocationReadiness(id);
   if(location.is_searchable===true && location.has_photos===true && result.searchV3Ready)verified.push(id);
   else incomplete.push(id);
 }
 return {dedupe,published,publishedLocationIds:(locations||[]).map(x=>String(x.id)),readyLocationIds:verified,needsReadiness:incomplete,
   // Requires a separate authenticated Search V3 retrieval after Azure sync.
   searchV3RetrievalCertified:false};
}
