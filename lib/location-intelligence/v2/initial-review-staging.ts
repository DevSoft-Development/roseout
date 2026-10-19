import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createDataForSeoReviewTask, getDataForSeoReviewTask } from "./dataforseo";
import { executeSingleFlightReviewTask } from "./review-single-flight";

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
  const controls=await rpc<{providers?: Array<{provider:string;max_usd_per_request:number;enabled:boolean}>}>(
    "li_v2_acquisition_controls_snapshot",{});
  const price=controls.providers?.find(p=>p.provider==="dataforseo");
  // Use the configured maximum, never a cheaper caller-provided guess.
  if(!price?.enabled || !Number.isFinite(price.max_usd_per_request) ||
      price.max_usd_per_request<=0 || input.quotedTaskUsd<price.max_usd_per_request)
    throw new Error("initial_reviews_provider_price_or_permission_invalid");
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
/** Execute ONLY an already operator-reserved review task in private AWS runtime.
 * Parallel invocations race on an atomic reserved->submitting state transition.
 * Never submit a second task if the prior response is unknown.
 */
export async function executeReservedInitialReview(input:{stageId:string;ledgerId:string}) {
  const task=await rpc<JsonObject>("li_v2_initial_review_task_snapshot",{p_id:input.ledgerId});
  if(!task || task.status!=="reserved")return {status:text(task?.status)||"not_found",submitted:false};
  if(text(task.stage_id)!==input.stageId)throw new Error("initial_review_stage_mismatch");
  const stage=await loadStage(input.stageId);
  const evidence=object(object(stage.raw_payload).independent_profile);
  const placeId=text(evidence.googlePlaceId);
  if(!placeId || placeId!==text(task.google_place_id) ||
      task.business_key!=="google:"+placeId)
    throw new Error("initial_review_identity_mismatch");
  const {data:coordinates,error:coordinateError}=await supabaseAdmin
    .from("location_import_staging").select("latitude,longitude")
    .eq("id",input.stageId).single();
  if(coordinateError)throw new Error("initial_review_coordinates_unavailable");
  const lat=Number(coordinates?.latitude),lon=Number(coordinates?.longitude);
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)
    throw new Error("initial_review_coordinates_invalid");
  return executeSingleFlightReviewTask({
    claim:()=>rpc<boolean>("li_v2_begin_initial_review_submission",{p_id:input.ledgerId}),
    post:()=>createDataForSeoReviewTask({
      googlePlaceId:placeId,locationCoordinate:`${lat},${lon},200`,
      depth:100,sortBy:"newest",tag:`toh:initial:${input.ledgerId}`,
    }),
    persist:async(providerTask)=>{
      const recorded=await rpc<boolean>("li_v2_update_initial_review_task",{
        p_id:input.ledgerId,p_expected_status:"submitting",p_status:"submitted",
        p_task_id:providerTask.id,
      });
      if(!recorded)throw new Error("initial_review_provider_task_checkpoint_conflict");
      await updateStage(input.stageId,{status:"pending",ledgerId:input.ledgerId,taskId:providerTask.id});
    },
    quarantine:async(error)=>{
      await rpc<boolean>("li_v2_update_initial_review_task",{
        p_id:input.ledgerId,p_expected_status:"submitting",p_status:"submission_unknown",
        p_error:error.slice(0,300),
      }).catch(()=>false);
    },
  });
}
/** Operator reservation is durable authorization. Only a separate protected AWS
 * dispatch request with the paid-execution flag enabled can consume it.
 * Reserved tasks are attempted once, submitted tasks are polled for free.
 */
export async function dispatchOperatorReservedInitialReviews(limit=10) {
  const tasks=await rpc<Array<{stage_id:string;ledger_id:string;status:string}>>(
    "li_v2_pending_initial_review_dispatch",{p_limit:Math.min(10,Math.max(1,Math.trunc(limit)))});
  const results:Array<{ledgerId:string;status:string}>=[];
  for(const task of tasks||[]){
    try{
      const result=task.status==="reserved"
        ?await executeReservedInitialReview({stageId:task.stage_id,ledgerId:task.ledger_id})
        :await collectInitialReviewSample({stageId:task.stage_id,ledgerId:task.ledger_id});
      results.push({ledgerId:task.ledger_id,status:String(result.status)});
    }catch(error){
      results.push({ledgerId:task.ledger_id,
        status:"failed:"+ (error instanceof Error?error.message:"unknown").slice(0,120)});
    }
  }
  return results;
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

/** Operator-supplied provider task ID recovery. Never submits a new charge. */
export async function reconcileUnknownInitialReview(input:{
  ledgerId:string; stageId:string; providerTaskId:string;
  explicitlyVerified:boolean;
}) {
  if(input.explicitlyVerified!==true)throw new Error("review_reconciliation_verification_required");
  if(!/^[0-9a-f-]{30,40}$/i.test(input.providerTaskId))
    throw new Error("review_provider_task_id_invalid");
  const stage=await loadStage(input.stageId);
  const task=await rpc<JsonObject>("li_v2_initial_review_task_snapshot",{p_id:input.ledgerId});
  if(text(task.stage_id)!==String(stage.id) || task.status!=="submission_unknown")
    throw new Error("initial_review_reconciliation_state_mismatch");
  // Confirm the known task can be retrieved. A response not yet finished is fine;
  // a nonexistent or inaccessible task is not eligible for reconciliation.
  const lookup=await getDataForSeoReviewTask(input.providerTaskId);
  if(!Array.isArray(lookup.tasks) || !lookup.tasks.length)
    throw new Error("review_provider_task_unverified");
  const updated=await rpc<boolean>("li_v2_update_initial_review_task",{
    p_id:input.ledgerId,p_expected_status:"submission_unknown",
    p_status:"submitted",p_task_id:input.providerTaskId,
  });
  if(!updated)throw new Error("review_reconciliation_concurrent_transition");
  await updateStage(input.stageId,{
    status:"pending",ledgerId:input.ledgerId,taskId:input.providerTaskId,
    reconciledAt:new Date().toISOString(),
  });
  return {status:"submitted" as const,reconciled:true};
}
