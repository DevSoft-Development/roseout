import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const a = await requireAdminApiRole(ADMIN_PAGE_ACCESS.giveawayManage); if (a.error) return a.error;
  const { taskId } = await params; const body = await request.json().catch(() => ({}));
  const updates: any = { updated_at: new Date().toISOString() };
  for (const key of ["title","description","test_url","instructions","email_summary","feature_area","priority","status","estimated_minutes","sort_order","predefined_prompt"]) if (body[key] !== undefined) updates[key] = body[key];
  if (body.assigned_prompt !== undefined) updates.predefined_prompt = body.assigned_prompt;
  if (body.status === "active") { updates.approved_by = a.adminUser?.user_id ?? null; updates.approved_at = new Date().toISOString(); }
  const { data, error } = await supabaseAdmin.from("beta_tasks").update(updates).eq("id", taskId).select("*").single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  await supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: a.adminUser?.user_id ?? null, action: body.status === "active" ? "weekly_task_approved" : "weekly_task_updated", entity_type: "beta_task", entity_id: taskId, summary: "Weekly beta task updated", metadata: updates });
  return NextResponse.json({ success: true, task: data });
}
