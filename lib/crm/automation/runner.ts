import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { claimDueSteps } from "./claim";
import { executeStep } from "./execute-step";
import { normalizeAutomationError } from "./errors";
import { nextRetryAt } from "./retry-policy";
import { loadAutomationSettings } from "./settings";
import type { AutomationRunResult,ClaimedStep,StepOutcome } from "./types";

async function persistOutcome(step:ClaimedStep,outcome:StepOutcome){
  const now=new Date().toISOString();
  const terminal=["completed","suppressed","exited","failed","skipped"].includes(outcome.status);
  const {error}=await supabaseAdmin.from("crm_sequence_step_executions").update({status:outcome.status,completed_at:terminal?now:null,failed_at:outcome.status==="failed"?now:null,next_retry_at:outcome.status==="retry_scheduled"?outcome.nextStepAt:null,lease_expires_at:null,result_snapshot:outcome.result??{}}).eq("id",step.execution_id);
  // The execution id and database claim are the idempotency boundary; do not repeat a completed side effect.
  if(error)throw error;
  if(outcome.status==="waiting"||outcome.status==="retry_scheduled")await supabaseAdmin.from("crm_sequence_enrollments").update({next_step_at:outcome.nextStepAt,status:"active"}).eq("id",step.enrollment_id);
  else if(outcome.status==="pending_approval")await supabaseAdmin.from("crm_sequence_enrollments").update({status:"paused",next_step_at:null}).eq("id",step.enrollment_id);
  else if(outcome.status==="exited"||outcome.status==="suppressed")await supabaseAdmin.from("crm_sequence_enrollments").update({status:"exited",next_step_at:null,exit_reason:String(outcome.result?.reason??outcome.status)}).eq("id",step.enrollment_id);
  else if(outcome.status==="completed"){
    const {data}=await supabaseAdmin.from("crm_sequence_steps").select("step_order").eq("sequence_id",step.sequence_id).gt("step_order",step.step_order).order("step_order").limit(1).maybeSingle();
    await supabaseAdmin.from("crm_sequence_enrollments").update(data?{current_step_order:data.step_order,next_step_at:outcome.nextStepAt??now,status:"active"}:{status:"completed",next_step_at:null,completed_at:now}).eq("id",step.enrollment_id).eq("current_step_order",step.step_order);
  }
  await supabaseAdmin.from("crm_sequence_events").insert({enrollment_id:step.enrollment_id,event_type:`execution_${outcome.status}`,metadata:{execution_id:step.execution_id,step_order:step.step_order}});
}

export async function runCrmSequenceAutomation(triggerSource="cron"):Promise<AutomationRunResult>{
  const workerId=`crm-${randomUUID()}`,startedAt=new Date().toISOString();
  const base={workerId,startedAt,finishedAt:startedAt,claimed:0,completed:0,waiting:0,pendingApproval:0,retried:0,suppressed:0,exited:0,failed:0,skipped:0,errors:[]} satisfies AutomationRunResult;
  const {data:run,error:runError}=await supabaseAdmin.from("crm_automation_runs").insert({worker_id:workerId,trigger_source:triggerSource}).select("id").single();
  if(runError)throw runError;
  const result:AutomationRunResult={...base,runId:run.id};
  try{
    const settings=await loadAutomationSettings();
    if(!settings.automationEnabled){result.disabled=true;result.finishedAt=new Date().toISOString();await supabaseAdmin.from("crm_automation_runs").update({status:"disabled",finished_at:result.finishedAt,metadata:{reason:settings.emergencyStopReason}}).eq("id",run.id);return result}
    const steps=await claimDueSteps(workerId,settings.batchSize,settings.leaseSeconds);result.claimed=steps.length;
    for(const step of steps){
      try{await supabaseAdmin.from("crm_sequence_step_executions").update({status:"processing",started_at:new Date().toISOString()}).eq("id",step.execution_id).eq("claimed_by",workerId);const outcome=await executeStep(step,settings);await persistOutcome(step,outcome);if(outcome.status==="pending_approval")result.pendingApproval++;else if(outcome.status==="retry_scheduled")result.retried++;else if(outcome.status==="completed")result.completed++;else if(outcome.status==="waiting")result.waiting++;else if(outcome.status==="suppressed")result.suppressed++;else if(outcome.status==="exited")result.exited++;else if(outcome.status==="failed")result.failed++;else result.skipped++}
      catch(raw){const error=normalizeAutomationError(raw),retry=error.retryable?nextRetryAt(step.attempt_count,new Date(),settings.maxAttempts):null,outcome:StepOutcome=retry?{status:"retry_scheduled",nextStepAt:retry.toISOString(),result:{code:error.code}}:{status:"failed",result:{code:error.code}};try{await persistOutcome(step,outcome)}catch{}if(retry)result.retried++;else result.failed++;result.errors.push({enrollmentId:step.enrollment_id,stepOrder:step.step_order,code:error.code,message:error.message});console.error(JSON.stringify({scope:"crm_automation",runId:run.id,workerId,enrollmentId:step.enrollment_id,executionId:step.execution_id,sequenceId:step.sequence_id,stepOrder:step.step_order,status:outcome.status,errorCode:error.code}))}
    }
    result.finishedAt=new Date().toISOString();await supabaseAdmin.from("crm_automation_runs").update({status:"completed",finished_at:result.finishedAt,claimed_count:result.claimed,completed_count:result.completed,waiting_count:result.waiting,approval_count:result.pendingApproval,retry_count:result.retried,suppressed_count:result.suppressed,exited_count:result.exited,failed_count:result.failed,skipped_count:result.skipped,error_summary:result.errors}).eq("id",run.id);return result;
  }catch(error){result.finishedAt=new Date().toISOString();await supabaseAdmin.from("crm_automation_runs").update({status:"failed",finished_at:result.finishedAt,error_summary:[{message:error instanceof Error?error.message:"runner failure"}]}).eq("id",run.id);throw error}
}
