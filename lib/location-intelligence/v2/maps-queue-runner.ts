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
 if(row?.status==="ready"||row?.status==="reviewed"||row?.status==="failed")return {status:row.status};
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
