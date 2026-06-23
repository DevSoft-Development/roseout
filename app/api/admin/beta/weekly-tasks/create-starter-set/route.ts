import { NextResponse } from "next/server";
import { createStarterWeeklyTasks } from "@/lib/beta/weeklyTasks";
import { requireBetaAdmin, safeError } from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const result = await createStarterWeeklyTasks({
      weekStart: body.weekStart ?? null,
      createdBy: auth.adminUser?.user_id ?? null,
    });

    await import("@/lib/supabaseAdmin").then(({ supabaseAdmin }) => supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: auth.adminUser?.user_id ?? null, actor_email: auth.adminUser?.email ?? null, actor_role: auth.adminUser?.role ?? null, action: "weekly_task_created", entity_type: "beta_task", summary: "Created or loaded this week starter beta tasks", metadata: { weekStart: result.weekStart, createdCount: result.createdCount } }));

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("CREATE_STARTER_WEEKLY_TASKS", error);
    return safeError("Could not create this week's starter beta tasks.", 500);
  }
}
