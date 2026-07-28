import { requireCronRequest } from "@/lib/cron-auth";
import { runCrmSequenceAutomation } from "@/lib/crm/automation";
export const runtime="nodejs";
export async function POST(request:Request){const unauthorized=requireCronRequest(request);if(unauthorized)return unauthorized;try{return Response.json(await runCrmSequenceAutomation("cron"))}catch(error){console.error(JSON.stringify({scope:"crm_automation",status:"runner_failed",error:error instanceof Error?error.message:"unknown"}));return Response.json({error:"CRM automation runner failed"},{status:500})}}
export const GET=POST;

