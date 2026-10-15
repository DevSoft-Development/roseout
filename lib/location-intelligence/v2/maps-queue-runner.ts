import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getMapsStandardTask, postMapsStandardTask } from "./dataforseo-maps-standard";

type Row={target_index:number;query:string;task_id:string|null;status:string};
async function update(runId:string,index:number,query:string,from:string,to:string,taskId?:string) {
 const {data,error}=await supabaseAdmin.rpc("li_v2_maps_queue_transition",{p_run_id:runId,p_index:index,p_query:query,p_from:from,p_to:to,p_task_id:taskId||null});
 if(error)throw error;
 return data as {changed:boolean;status:string;task_id:string|null};
}
/** Submission and polling run on separate worker invocations. Uncertain posts are never retried. */
export async function advanceMapsQueue(runId:string,index:number,query:string) {
 const {data,error}=await supabaseAdmin.rpc("li_v2_maps_queue_snapshot",{p_run_id:runId});
 if(error)throw error;
 const row=(data as Row[]).find(r=>r.target_index===index);
 if(row?.query!==undefined&&row.query!==query)throw new Error("queue_query_mismatch");
 if(row?.status==="submitting"||row?.status==="uncertain")return {status:"manual_reconciliation_required"};
 if(row?.status==="ready"){
   if(!row.task_id)throw new Error("ready_queue_task_id_missing");
   const fetched=await getMapsStandardTask(row.task_id);
   return fetched.status==="ready"?{status:"ready",items:fetched.items}:{status:"pending"};
 }
 if(row?.status==="reviewed"||row?.status==="failed")return {status:row.status};
 if(row?.status==="pending"){
   if(!row.task_id)throw new Error("missing_task_id");
   const result=await getMapsStandardTask(row.task_id);
   if(result.status==="pending")return {status:"pending"};
   await update(runId,index,query,"pending","ready");
   // Provider data are not persisted or published until rights and source checks pass.
   return {status:"ready",items:result.items};
 }
 return {status:"prepared"};
}
/** Caller must reserve the $0.000600 SKU and confirm campaign controls BEFORE this call. */
export async function submitReservedMapsQueue(runId:string,index:number,query:string) {
 const claim=await update(runId,index,query,"prepared","submitting");
 if(!claim.changed)throw new Error("queue_submission_not_available");
 try{
   const posted=await postMapsStandardTask(query);
   const saved=await update(runId,index,query,"submitting","pending",posted.taskId);
   if(!saved.changed)throw new Error("queue_task_id_not_persisted");
   return {status:"pending",taskId:posted.taskId};
 }catch{
   await update(runId,index,query,"submitting","uncertain");
   return {status:"manual_reconciliation_required"};
 }
}

/** Exact-SKU reservation happens before the billable POST. */
export async function submitApprovedMapsQueue(input:{
 runId:string;campaignId:string;targetIndex:number;query:string
}) {
 const {runId,campaignId,targetIndex,query}=input;
 const {data:permitted,error:permitError}=await supabaseAdmin.rpc("li_v2_campaign_run_permitted",{p_run_id:runId});
 if(permitError||permitted!==true)throw new Error("campaign_not_permitted");
 const {data:cfg,error:cfgError}=await supabaseAdmin.rpc("li_v2_acquisition_controls_snapshot");
 const price=Array.isArray(cfg?.providers)?cfg.providers.find((v:{provider:string})=>v.provider==="dataforseo_maps_standard"):null;
 if(cfgError||!price||price.enabled!==true||Number(price.max_usd_per_request)!==0.0006)
   throw new Error("maps_standard_price_control_not_approved");
 const {data:preflight,error:preflightError}=await supabaseAdmin.rpc("li_v2_paid_acquisition_preflight",{
   p_campaign_id:campaignId,p_provider:"dataforseo_maps_standard",p_price_usd:0.0006,
 });
 if(preflightError||preflight!==true)throw new Error("maps_standard_budget_disabled");
 const eventKey="li-v2-maps-"+runId+"-"+targetIndex;
 const {data:reserved,error:reserveError}=await supabaseAdmin.rpc("reserve_location_acquisition_spend",{
  p_event_key:eventKey,p_provider:"dataforseo_maps_standard",p_operation:"discovery",
  p_estimated_usd:0.0006,p_campaign_id:campaignId,p_run_id:runId,
 });
 if(reserveError||reserved!==true)throw new Error("maps_standard_reservation_denied");
 return submitReservedMapsQueue(runId,targetIndex,query);
}
