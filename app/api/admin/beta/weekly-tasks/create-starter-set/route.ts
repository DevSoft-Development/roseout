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

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("CREATE_STARTER_WEEKLY_TASKS", error);
    return safeError("Could not create this week's starter beta tasks.", 500);
  }
}
