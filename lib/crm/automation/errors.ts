import "server-only";

export type AutomationErrorCategory=
  | "configuration"
  | "consent"
  | "provider"
  | "database"
  | "dependency"
  | "unsupported";

export class AutomationError extends Error {
  constructor(
    public code:string,
    message:string,
    public retryable:boolean,
    public category:AutomationErrorCategory,
    public metadata:Record<string,unknown>={}
  ){
    super(message);
    this.name="AutomationError";
  }
}

type StructuredError={
  code?:unknown;
  message?:unknown;
  details?:unknown;
  hint?:unknown;
  status?:unknown;
  statusCode?:unknown;
};

function nonEmptyString(value:unknown){
  return typeof value==="string"&&value.trim()?value.trim():null;
}

export function normalizeAutomationError(error:unknown):AutomationError{
  if(error instanceof AutomationError)return error;
  if(error instanceof Error){
    return new AutomationError(
      "UNEXPECTED",
      error.message||error.name||"Unknown automation failure",
      true,
      "dependency",
      {name:error.name}
    );
  }
  if(error&&typeof error==="object"){
    const structured=error as StructuredError;
    const code=nonEmptyString(structured.code)??"DATABASE_ERROR";
    const message=
      nonEmptyString(structured.message)??
      nonEmptyString(structured.details)??
      "Unknown database automation failure";
    return new AutomationError(code,message,true,"database",{
      details:nonEmptyString(structured.details),
      hint:nonEmptyString(structured.hint),
      status:structured.status??structured.statusCode??null,
    });
  }
  return new AutomationError("UNEXPECTED",String(error??"Unknown automation failure"),true,"dependency");
}
