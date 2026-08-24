import { requireCronRequest } from "@/lib/cron-auth";
import { runCrmSequenceAutomation } from "@/lib/crm/automation";
import { normalizeAutomationError } from "@/lib/crm/automation/errors";

export const runtime="nodejs";

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
    }));
    return Response.json({error:"CRM automation runner failed"},{status:500});
  }
}

export const GET=POST;
