import { NextResponse } from "next/server";
import { assignWeeklyBetaTasksForAllActiveTesters } from "@/lib/beta/weeklyTasks";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBetaAdmin, safeError } from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  try {
    const results = await assignWeeklyBetaTasksForAllActiveTesters();
    const assigned = results.reduce((sum, result) => sum + Number(result.assigned || 0), 0);
    await supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: auth.adminUser?.user_id ?? null, actor_email: auth.adminUser?.email ?? null, actor_role: auth.adminUser?.role ?? null, action: "weekly_task_assigned_all", entity_type: "beta_task_assignment", summary: "Assigned active weekly beta tasks to all active beta testers", metadata: { assigned, testerCount: results.length } });
    return NextResponse.json({ success: true, assigned, testerCount: results.length, message: `Assigned ${assigned} weekly beta tasks across ${results.length} active beta testers.` });
  } catch (error) {
    console.error("ASSIGN_WEEKLY_TASKS_ALL", error);
    return safeError("Unable to assign weekly beta tasks.", 500);
  }
}
