import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createDataForSeoReviewTask, getDataForSeoReviewTask } from "./dataforseo";

type JsonObject = Record<string, unknown>;
const object = (v: unknown): JsonObject =>
  v && typeof v === "object" && !Array.isArray(v) ? v as JsonObject : {};
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
async function rpc<T>(name: string, args: JsonObject): Promise<T> {
  const {data,error} = await supabaseAdmin.rpc(name,args);
  if(error) throw new Error(name + ":" + error.message);
  return data as T;
}
async function loadStage(stageId:string) {
  const {data,error}=await supabaseAdmin.from("location_import_staging")
    .select("id,source,source_id,raw_payload,import_status")
    .eq("id",stageId).single();
  if(error||!data || data.source!=="li_v2_independent" || data.import_status==="published")
    throw new Error("initial_review_stage_not_eligible");
  return data;
}
async function updateStage(stageId:string, sample:JsonObject) {
  const stage=await loadStage(stageId);
  const raw=object(stage.raw_payload);
  const {error}=await supabaseAdmin.from("location_import_staging")
    .update({raw_payload:{...raw,li_v2_initial_review_sample:sample}})
    .eq("id",stageId).neq("import_status","published");
  if(error)throw new Error("initial_review_checkpoint_write_failed:"+error.message);
}
export type InitialReviewRequest = {
 stageId:string; campaignId:string; runId:string; googlePlaceId:string;
 /** Verified provider price per 100-review task in USD. No guessed defaults. */
 quotedTaskUsd:number;
 /** Must come from explicit operator authorization, not the worker's default. */
 authorized:boolean;
 latitude:number;longitude:number;
};
export async function submitInitialReviewSample(input:InitialReviewRequest) {
  if(input.authorized!==true)throw new Error("initial_reviews_operator_authorization_required");
  if(!Number.isFinite(input.quotedTaskUsd)||input.quotedTaskUsd<=0)
    throw new Error("initial_reviews_verified_price_required");
  if(!/^[-\w]{8,255}$/.test(input.googlePlaceId))
    throw new Error("initial_reviews_google_place_id_required");
  const stage=await loadStage(input.stageId);
  const evidence=object(object(stage.raw_payload).independent_profile);
  if(text(evidence.googlePlaceId)!==input.googlePlaceId)
    throw new Error("initial_reviews_google_identity_mismatch");
  const businessKey="google:"+input.googlePlaceId;
  const claim=await rpc<{id?:string;status:string;created:boolean}>(
    "li_v2_claim_initial_review_task",{
      p_stage_id:input.stageId,p_business_key:businessKey,p_campaign_id:input.campaignId,
      p_run_id:input.runId,p_google_place_id:input.googlePlaceId,
      p_estimated_usd:input.quotedTaskUsd,
    });
  if(claim.status==="budget_denied")return {status:"budget_denied" as const};
  if(!claim.id)throw new Error("initial_reviews_missing_ledger_id");
  if(!claim.created)return {status:claim.status,ledgerId:claim.id,submitted:false};
  const started=await rpc<boolean>("li_v2_begin_initial_review_submission",{p_id:claim.id});
  if(started!==true) return {status:"already_claimed",ledgerId:claim.id,submitted:false};
  // FROM THIS POINT ANY ERROR COULD MEAN THE PROVIDER ACCEPTED A CHARGE.
  // Never automatically return this ledger to reserved or repeat task_post.
  try {
    const task=await createDataForSeoReviewTask({
      googlePlaceId:input.googlePlaceId,
      locationCoordinate:`${input.latitude},${input.longitude},200`,
      depth:100,sortBy:"newest",tag:`toh:initial:${claim.id}`,
    });
    await rpc<boolean>("li_v2_update_initial_review_task",{
      p_id:claim.id,p_expected_status:"submitting",p_status:"submitted",
      p_task_id:task.id,
    });
    await updateStage(input.stageId,{status:"pending",taskId:task.id,ledgerId:claim.id});
    return {status:"submitted" as const,ledgerId:claim.id,taskId:task.id};
  } catch(e) {
    // If the provider accepted the request but we lost its response, operator
    // reconciliation by stable tag/ledger ID is necessary before further POSTs.
    await rpc<boolean>("li_v2_update_initial_review_task",{
      p_id:claim.id,p_expected_status:"submitting",p_status:"submission_unknown",
      p_error:e instanceof Error ? e.message.slice(0,300):"unknown_submission_error",
    }).catch(()=>false);
    return {status:"submission_unknown" as const,ledgerId:claim.id};
  }
}
export async function collectInitialReviewSample(input:{stageId:string;ledgerId:string}) {
  const stage=await loadStage(input.stageId);
  const task=await rpc<JsonObject>("li_v2_initial_review_task_snapshot",{p_id:input.ledgerId});
  if(text(task.stage_id)!==input.stageId)throw new Error("review_task_stage_mismatch");
  if(task.status==="collected" || task.status==="not_available")
    return {status:task.status as string,alreadyCompleted:true};
  if(task.status!=="submitted" || !text(task.provider_task_id))
    return {status:text(task.status)||"pending",alreadyCompleted:false};
  const payload=await getDataForSeoReviewTask(text(task.provider_task_id));
  const entry=Array.isArray(payload.tasks)?payload.tasks[0]:undefined;
  if(!entry || Number(entry.status_code)!==20000 || !Array.isArray(entry.result))
    return {status:"pending" as const};
  const results=entry.result as JsonObject[];
  const seen=new Set<string>();
  const items:JsonObject[]=[];
  for(const result of results){
    const reviews=Array.isArray(result.items)?result.items:[];
    for(const candidate of reviews){
      const review=object(candidate);
      const id=text(review.review_id);
      if(!id || seen.has(id))continue;
      seen.add(id);items.push(review);
      if(items.length>=100)break;
    }
    if(items.length>=100)break;
  }
  const isEmpty=items.length===0;
  const status=isEmpty?"not_available":"imported";
  // Write durable stage checkpoint BEFORE terminal ledger transition.
  await updateStage(input.stageId,{
    status,taskId:task.provider_task_id,ledgerId:input.ledgerId,
    collectedAt:new Date().toISOString(),reviewCount:items.length,
    provider:"dataforseo",reviews:items,
    ...(isEmpty?{reason:"provider_completed_with_no_reviews"}:{}),
  });
  await rpc<boolean>("li_v2_update_initial_review_task",{
    p_id:input.ledgerId,p_expected_status:"submitted",
    p_status:isEmpty?"not_available":"collected",p_result_count:items.length,
  });
  return {status,reviewCount:items.length};
}
