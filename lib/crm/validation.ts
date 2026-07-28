import { accountTypes, lifecycleStages, taskStatuses, type AccountType, type LifecycleStage, type TaskStatus } from "./types";
export const normalizeEmail=(value:string|null|undefined)=>value?.trim().toLowerCase()||null;
export function normalizeLifecycle(value:string):LifecycleStage { if(!(lifecycleStages as readonly string[]).includes(value)) throw new Error("Invalid account lifecycle stage"); return value as LifecycleStage; }
export function normalizeAccountType(value:string):AccountType { if(!(accountTypes as readonly string[]).includes(value)) throw new Error("Invalid account type"); return value as AccountType; }
export function validateTaskTransition(from:TaskStatus,to:TaskStatus){ if(!(taskStatuses as readonly string[]).includes(to)) throw new Error("Invalid task status"); if(from==="cancelled"&&to!=="open") throw new Error("Cancelled tasks must be reopened first"); return to; }
export const isTaskOverdue=(dueAt:string|null,status:string,now=new Date())=>Boolean(dueAt&&!["completed","cancelled"].includes(status)&&new Date(dueAt)<now);

