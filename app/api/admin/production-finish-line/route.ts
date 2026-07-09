import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { accessSeeds, betaSeeds, commandSeeds, dailyTaskSeeds, decisionSeed, gateSeeds, qrSeeds, reserveSeeds, searchPromptSeeds, securitySeeds } from "@/lib/production-finish-line/seeds";

export const dynamic = "force-dynamic";
const allowed = ADMIN_PAGE_ACCESS.productionFinishLine;

async function ensureSeeded(userId: string) {
  const { count } = await supabaseAdmin.from("production_finish_line_items").select("id", { count: "exact", head: true });
  if (!count) {
    await supabaseAdmin.from("production_finish_line_items").insert([...gateSeeds, ...dailyTaskSeeds.map((t,i)=>({ ...t, sort_order: i+1 })), ...reserveSeeds, ...betaSeeds, ...securitySeeds, decisionSeed].map((r)=>({ ...r, created_by:userId, updated_by:userId })));
  }
  const seed = async (table:string, rows:any[], onConflict:string) => {
    const { count: c } = await supabaseAdmin.from(table).select("id", { count:"exact", head:true });
    if (!c) await supabaseAdmin.from(table).upsert(rows.map((r)=>({ ...r, created_by:userId, updated_by:userId })), { onConflict });
  };
  await seed("production_access_tests", accessSeeds, "role_name,area_name");
  await seed("production_qr_claim_pilot", qrSeeds, "pilot_number");
  await seed("production_command_results", commandSeeds, "command");
  await seed("production_search_readiness_prompts", searchPromptSeeds, "prompt");
}

export async function GET() {
  const auth = await requireAdminApiRole(allowed);
  if (auth.error) return auth.error;
  await ensureSeeded(auth.adminUser.user_id);
  const [items, access, qr, commands, prompts] = await Promise.all([
    supabaseAdmin.from("production_finish_line_items").select("*").order("sort_order"),
    supabaseAdmin.from("production_access_tests").select("*").order("sort_order"),
    supabaseAdmin.from("production_qr_claim_pilot").select("*").order("pilot_number"),
    supabaseAdmin.from("production_command_results").select("*").order("sort_order"),
    supabaseAdmin.from("production_search_readiness_prompts").select("*").order("sort_order"),
  ]);
  const error = [items.error, access.error, qr.error, commands.error, prompts.error].find(Boolean);
  if (error) return NextResponse.json({ success:false, error: error.message }, { status:500 });
  return NextResponse.json({ success:true, data:{ items:items.data, access:access.data, qr:qr.data, commands:commands.data, prompts:prompts.data }});
}

const tableMap: Record<string,string> = { items:"production_finish_line_items", access:"production_access_tests", qr:"production_qr_claim_pilot", commands:"production_command_results", prompts:"production_search_readiness_prompts" };
const allowedFields = new Set(["status","owner","notes","test_url","codex_task_url","github_pr_url","last_checked","expected_behavior","actual_behavior","location_id","location_name","address","claim_code","claim_url","qr_verified","postcard_printed","mailed","scanned","claim_started","claim_submitted","claim_approved","owner_dashboard_works","last_run_date","result","runner","expected_result","actual_result","issue_type","reviewed_at"]);
export async function PATCH(request: Request) {
  const auth = await requireAdminApiRole(allowed);
  if (auth.error) return auth.error;
  const body = await request.json().catch(()=>null);
  const table = tableMap[String(body?.collection ?? "")];
  const id = typeof body?.id === "string" ? body.id : null;
  if (!table || !id || !body?.updates || typeof body.updates !== "object") return NextResponse.json({ success:false, error:"Invalid update" }, { status:400 });
  const updates = Object.fromEntries(Object.entries(body.updates).filter(([k])=>allowedFields.has(k)));
  const { data, error } = await supabaseAdmin.from(table).update({ ...updates, updated_by: auth.adminUser.user_id }).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ success:false, error:error.message }, { status:500 });
  return NextResponse.json({ success:true, data });
}
