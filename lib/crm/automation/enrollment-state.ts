import "server-only";
export function executionKey(enrollmentId:string,stepOrder:number,generation=1){if(!enrollmentId||stepOrder<1||generation<1)throw new Error("Invalid execution identity");return `${enrollmentId}:${stepOrder}:${generation}`}
export function nextEnrollmentState(currentOrder:number,orders:number[],nextStepAt:string){const next=orders.filter(x=>x>currentOrder).sort((a,b)=>a-b)[0];return next?{status:"active" as const,currentStepOrder:next,nextStepAt}:{status:"completed" as const,currentStepOrder:currentOrder,nextStepAt:null}}

