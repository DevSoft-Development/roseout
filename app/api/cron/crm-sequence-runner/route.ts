import { requireCronRequest } from "@/lib/cron-auth";
import { runCrmSequenceAutomation } from "@/lib/crm/automation";
import { normalizeAutomationError } from "@/lib/crm/automation/errors";

export const runtime="nodejs";

function isPrivateAwsRequest(request:Request){
  return (
    request.headers.get("x-toh-aws-internal") === "managed-dispatch" ||
    String(process.env.PLATFORM_RUNTIME_PROVIDER || "").trim() === "aws-background"
  );
}

export async function POST(request:Request){
  const unauthorized=requireCronRequest(request);
  if(unauthorized)return unauthorized;
  try{
    return Response.json(await runCrmSequenceAutomation("cron"));
  }catch(raw){
    const error=normalizeAutomationError(raw);
    console.error(JSON.stringify({
      scope:"crm_automation",
      status:"runner_failed",
      errorCode:error.code,
      category:error.category,
      error:error.message,
      runtimeProvider:String(process.env.PLATFORM_RUNTIME_PROVIDER || "web"),
    }));
    return Response.json(
      isPrivateAwsRequest(request)
        ? {error:"CRM automation runner failed",errorCode:error.code,category:error.category,runtime:"aws-background"}
        : {error:"CRM automation runner failed"},
      {status:500},
    );
  }
}

export const GET=POST;
