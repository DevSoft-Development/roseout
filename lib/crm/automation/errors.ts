import "server-only";
export type AutomationErrorCategory="configuration"|"consent"|"provider"|"database"|"dependency"|"unsupported";
export class AutomationError extends Error { constructor(public code:string,message:string,public retryable:boolean,public category:AutomationErrorCategory,public metadata:Record<string,unknown>={}){super(message);this.name="AutomationError"} }
export function normalizeAutomationError(error:unknown){return error instanceof AutomationError?error:new AutomationError("UNEXPECTED",error instanceof Error?error.message:"Unknown automation failure",true,"dependency")}

