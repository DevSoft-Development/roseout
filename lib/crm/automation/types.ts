import "server-only";

export type StepType = "email"|"wait"|"task"|"manual_review"|"internal_notification"|"exit_check";
export type AutomationSettings = {automationEnabled:boolean;emailAutomationEnabled:boolean;taskAutomationEnabled:boolean;batchSize:number;leaseSeconds:number;maxAttempts:number;dailyLimit:number;weeklyLimit:number;quietHoursEnabled:boolean;defaultTimezone:string;emergencyStopReason:string|null};
export type ClaimedStep = {enrollment_id:string;sequence_id:string;step_id:string;step_order:number;step_type:string;step_config:Record<string,unknown>;execution_id:string;execution_key:string;attempt_count:number;lease_recovered:boolean};
export type RunError = {enrollmentId:string;stepOrder:number;code:string;message:string};
export type AutomationRunResult = {runId?:string;workerId:string;startedAt:string;finishedAt:string;claimed:number;completed:number;waiting:number;pendingApproval:number;retried:number;suppressed:number;exited:number;failed:number;skipped:number;errors:RunError[];disabled?:boolean};
export type ExitRuleResult = {shouldExit:boolean;reasonCode?:string;reason?:string;matchedRule?:Record<string,unknown>};
export type StepOutcome = {status:"completed"|"waiting"|"pending_approval"|"retry_scheduled"|"suppressed"|"exited"|"failed"|"skipped";nextStepAt?:string;result?:Record<string,unknown>};

