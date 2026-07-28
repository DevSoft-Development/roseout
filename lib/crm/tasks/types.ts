import type { AdminRole } from "@/lib/users/roles";
export const QUEUES=["general","sales","outreach","claims","onboarding","support","reservations","billing","content","data_quality","renewals","partnerships"] as const;
export const ESCALATIONS=["none","attention","manager","critical"] as const;
export const PRIORITIES=["low","normal","high","urgent"] as const;
export type QueueKey=typeof QUEUES[number]; export type EscalationLevel=typeof ESCALATIONS[number]; export type Priority=typeof PRIORITIES[number];
export type TaskActor={user_id:string;email:string|null;role:AdminRole};
export type TaskErrorCode="UNAUTHORIZED"|"NOT_FOUND"|"VERSION_CONFLICT"|"INVALID_TRANSITION"|"MISSING_COMPLETION_REQUIREMENT"|"INVALID_RELATIONSHIP"|"INVALID_ASSIGNEE"|"INVALID_TEAM"|"DEPENDENCY_CONFLICT"|"CIRCULAR_DEPENDENCY"|"TASK_ARCHIVED";
export class TaskOperationError extends Error{constructor(public code:TaskErrorCode,message:string){super(message);this.name="TaskOperationError"}}
export type QueueFilters={search?:string;queue?:QueueKey;status?:string;priority?:Priority;escalation?:EscalationLevel;assignee?:string;team?:string;account?:string;location?:string;opportunity?:string;overdue?:boolean;unassigned?:boolean;blocked?:boolean;page?:number;sort?:string};
export type BulkResult={succeeded:string[];failed:Array<{taskId:string;code:string;message:string}>};
