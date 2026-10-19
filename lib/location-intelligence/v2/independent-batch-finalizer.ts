import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dedupeStagedLocationsChunk } from "@/lib/location-growth/dedupeStaging";
import { publishReadyStagedLocations } from "@/lib/location-growth/publishReady";
import { refreshLocationClassificationV2 } from "@/lib/location-intelligence/v2/classification";
import { refreshLocationReadiness } from "@/lib/location-intelligence/v2/readiness";
import { discoverMenu } from "@/supabase/functions/unified-location-gap-repair/menu-discovery";
import { evaluateLocationPublishability } from "@/lib/location-publishability";
import { buildLocationSearchDocument } from "@/lib/location-profile-fields";
import { assessOneTouchImport } from "./one-touch-acceptance";

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
 // Resolve first-import menu intelligence BEFORE publishing the profile.
 // Do not allow a network outage to silently turn into a placeholder menu:
 // store an explicit unavailable/error state for the initial acquisition.
 const {data:prepublishRows,error:prepublishError}=await supabaseAdmin
   .from("location_import_staging")
   .select("id,website,raw_payload,import_status")
   .eq("batch_id",batchId).neq("import_status","published").limit(50);
 if(prepublishError)throw new Error("independent_prepublication_intelligence_read_failed:"+prepublishError.message);
 const initialMenus=new Map<string,Awaited<ReturnType<typeof discoverMenu>>|null>();
 for(const stage of prepublishRows||[]){
   const website=String(stage.website||"").trim();
   if(!website)continue;
   const payload=stage.raw_payload && typeof stage.raw_payload==="object" && !Array.isArray(stage.raw_payload)
     ? stage.raw_payload as Record<string,unknown>:{};
   const prior=payload.li_v2_prepublication_menu as Record<string,unknown>|undefined;
   if(prior && prior.website===website && prior.status!=="error"){
     // Retain a previously certified prepublication result on crash-safe retry.
     continue;
   }
   let menu:Awaited<ReturnType<typeof discoverMenu>>|null=null;
   let errorMessage:string|null=null;
   try {menu=await discoverMenu(website,{analyzeContent:true});}
   catch(e){errorMessage=e instanceof Error?e.message:"menu_discovery_unavailable";}
   const outcome={website,checkedAt:new Date().toISOString(),
     status:errorMessage?"error":menu?.status||"unavailable",
     menuUrl:menu?.menuUrl||null,
     source:menu?.source||null,confidence:menu?.confidence||null,
     intelligence:menu?.intelligence||null,
     note:errorMessage||menu?.note||null};
   const {error:saveError}=await supabaseAdmin.from("location_import_staging")
     .update({raw_payload:{...payload,li_v2_prepublication_menu:outcome}}).eq("id",stage.id);
   if(saveError)throw new Error("independent_prepublication_intelligence_write_failed:"+saveError.message);
   initialMenus.set(website,menu);
 }
 // Persist per-location acceptance evidence before any publication attempt.
 // A pending review sample is explicitly NOT considered one-touch complete.
 const {data:acceptanceRows,error:acceptanceError}=await supabaseAdmin.from("location_import_staging")
   .select("id,name,address,city,state,website,latitude,longitude,phone,main_image,has_photos,raw_payload,import_status")
   .eq("batch_id",batchId).neq("import_status","published").limit(50);
 if(acceptanceError)throw new Error("independent_first_import_acceptance_read_failed:"+acceptanceError.message);
 for(const row of acceptanceRows||[]){
   const payload=row.raw_payload&&typeof row.raw_payload==="object"&&!Array.isArray(row.raw_payload)
     ?row.raw_payload as Record<string,unknown>:{};
   const acceptance=assessOneTouchImport(row);
   const {error:checkpointError}=await supabaseAdmin.from("location_import_staging")
     .update({raw_payload:{...payload,li_v2_one_touch_acceptance:acceptance}}).eq("id",row.id);
   if(checkpointError)throw new Error("independent_first_import_acceptance_write_failed:"+checkpointError.message);
   if(!acceptance.profileReady)
     throw new Error("independent_first_import_profile_incomplete:"+acceptance.missing.join(","));
 }
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
      .select("id,import_source_id,is_searchable,has_photos,website,metadata").eq("import_source","li_v2_independent")
      .in("import_source_id",sourceIds)
   :{data:[],error:null};
 if(locationError)throw new Error("independent_published_location_lookup_failed");
 const verified:string[]=[];
 const incomplete:string[]=[];
 for(const location of locations||[]){
   const id=String(location.id);
   // Initial import intelligence: reuse the verified website, never paid discovery.
   const website=String(location.website||"");
   if(website){
     // The prepublication scan is authoritative for newly staged rows; legacy
     // retry paths without staged evidence retain the existing safe fallback.
     const menu=initialMenus.has(website)?initialMenus.get(website)!:
       await discoverMenu(website,{analyzeContent:true}).catch(()=>null);
     if(menu){
       const {error:menuError}=await supabaseAdmin.from("locations")
         .update({
           menu_url:menu.menuUrl,menu_url_source:menu.source,
           menu_discovery_status:menu.status,
           menu_discovery_confidence:menu.confidence,
           menu_discovery_checked_at:new Date().toISOString(),
           ...(menu.intelligence?{
             menu_content_hash:menu.intelligence.contentHash,
             menu_intelligence_version:menu.intelligence.version,
             menu_intelligence_checked_at:new Date().toISOString()
           }:{}),
           metadata:{...(location.metadata && typeof location.metadata==="object" && !Array.isArray(location.metadata)?location.metadata:{}),
             li_v2_initial_menu:{status:menu.status,url:menu.menuUrl,intelligence:menu.intelligence,note:menu.note}}
         })
         .eq("id",id);
       if(menuError)throw new Error("initial_menu_intelligence_write_failed:"+menuError.message);
     }
   }
   // Create initial review collection state once. Do not submit new paid tasks
   // implicitly; the approved review worker handles budgeted, opted-in jobs.
   const {data:reviewState,error:reviewReadError}=await supabaseAdmin.from("location_review_refresh_state")
     .select("location_id").eq("location_id",id).eq("provider","dataforseo").maybeSingle();
   if(reviewReadError)throw new Error("initial_review_state_read_failed:"+reviewReadError.message);
   if(!reviewState){
     const {error:reviewWriteError}=await supabaseAdmin.from("location_review_refresh_state").upsert({
       location_id:id,provider:"dataforseo",popularity_score:0,
       refresh_enabled:false,next_refresh_at:null,
       metadata:{taskStatus:"awaiting_authorized_initial_100",ingestMode:"initial_100",
         routinePaidRefresh:false},
       updated_at:new Date().toISOString()
     },{onConflict:"location_id,provider",ignoreDuplicates:true});
     if(reviewWriteError)throw new Error("initial_review_state_write_failed:"+reviewWriteError.message);
   }
   await refreshLocationClassificationV2(id);
   // Reconcile the separate consumer quality gate using canonical publication
   // policy. Search V3 readiness alone never grants public eligibility.
   const {data:publishedRow,error:publishReadError}=await supabaseAdmin.from("locations")
     .select("*").eq("id",id).single();
   if(publishReadError)throw new Error("independent_publishability_read_failed");
   // Newly imported locations must be retrievable by business name, not only
   // the menu-signature tokens that legacy staging sometimes leaves behind.
   const canonicalDocument=buildLocationSearchDocument(publishedRow);
   const existingDocument=String(publishedRow.search_document||"").trim();
   const searchableName=String(publishedRow.name||"").trim().toLowerCase();
   if (canonicalDocument && searchableName && !existingDocument.toLowerCase().includes(searchableName)) {
     const {error:documentError}=await supabaseAdmin.from("locations")
       .update({search_document:[canonicalDocument,existingDocument].filter(Boolean).join(" ").slice(0,12000)})
       .eq("id",id);
     if(documentError)throw new Error("independent_search_document_reconciliation_failed:"+documentError.message);
   }
   const eligibility=evaluateLocationPublishability(publishedRow,{allowApproval:true});
   if(eligibility.isSearchable && publishedRow.quality_status!=="publish_ready"){
     const {error:qualityError}=await supabaseAdmin.from("locations")
       .update({quality_status:"publish_ready"})
       .eq("id",id).eq("quality_status",publishedRow.quality_status);
     if(qualityError)throw new Error("independent_publishability_reconciliation_failed");
   }
   const result=await refreshLocationReadiness(id);
   if(location.is_searchable===true && location.has_photos===true && result.searchV3Ready)verified.push(id);
   else incomplete.push(id);
 }
 return {dedupe,published,publishedLocationIds:(locations||[]).map(x=>String(x.id)),readyLocationIds:verified,needsReadiness:incomplete,
   // Requires a separate authenticated Search V3 retrieval after Azure sync.
   searchV3RetrievalCertified:false};
}
