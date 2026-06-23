import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentWeekStart } from "@/lib/beta/weeklyTasks";

async function auth() { return requireAdminApiRole(ADMIN_PAGE_ACCESS.giveawayManage); }

export async function GET(request: Request) {
  const a = await auth(); if (a.error) return a.error;
  const weekStart = new URL(request.url).searchParams.get("weekStart") || getCurrentWeekStart();
  const { data: tasks, error } = await supabaseAdmin.from("beta_tasks").select("*").eq("week_start", weekStart).neq("status", "archived").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  const ids = (tasks || []).map((t: any) => t.id);
  const counts: Record<string, { assigned: number; completed: number }> = {};
  if (ids.length) {
    const { data: assignments } = await supabaseAdmin.from("beta_task_assignments").select("task_id,status").in("task_id", ids).eq("assigned_week_start", weekStart);
    for (const row of assignments || []) {
      counts[row.task_id] ||= { assigned: 0, completed: 0 };
      counts[row.task_id].assigned += 1;
      if (row.status === "completed") counts[row.task_id].completed += 1;
    }
  }
  return NextResponse.json({ success: true, weekStart, tasks: (tasks || []).map((t: any) => ({ ...t, assigned_count: counts[t.id]?.assigned || 0, completed_count: counts[t.id]?.completed || 0 })) });
}

export async function POST(request: Request) {
  const a = await auth(); if (a.error) return a.error;
  const body = await request.json().catch(() => ({}));
  const weekStart = body.week_start || getCurrentWeekStart();
  const row = { title: String(body.title || "Quick beta task"), description: body.description || null, test_url: body.test_url || null, instructions: body.instructions || body.description || null, email_summary: body.email_summary || body.description || null, predefined_prompt: body.assigned_prompt || body.predefined_prompt || null, feature_area: body.feature_area || "general", priority: body.priority || "medium", status: body.status === "active" ? "active" : "draft", tester_type: "user", week_start: weekStart, estimated_minutes: Number(body.estimated_minutes || 10), is_template: true, created_by: a.adminUser?.user_id ?? null, sort_order: Number(body.sort_order || 0) } as any;
  const { data, error } = await supabaseAdmin.from("beta_tasks").insert(row).select("*").single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  await supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: a.adminUser?.user_id ?? null, actor_email: a.adminUser?.email ?? null, actor_role: a.adminUser?.role ?? null, action: "weekly_task_created", entity_type: "beta_task", entity_id: data.id, summary: "Weekly beta task created", metadata: { weekStart } });
  return NextResponse.json({ success: true, task: data });
}
