import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { requireBetaAdmin, safeError } from "../_shared";
import { assignWeeklyBetaTasksForTester } from "@/lib/beta/weeklyTasks";

const BETA_TESTER_LIST_FIELDS = "id,name,email,tester_type,status,weekly_required_tests,weekly_completed_tests,current_week_start,last_active_at,created_at,updated_at";
const BETA_TESTER_MUTATION_FIELDS = "id,name,email,tester_type,status,weekly_required_tests,weekly_completed_tests,current_week_start,last_active_at,updated_at";

export async function GET() {
  const a = await requireBetaAdmin();
  if (a.error) return a.error;
  const { data, error } = await getAdminDatabaseClient().from("beta_testers").select(BETA_TESTER_LIST_FIELDS).order("created_at", { ascending: false }).limit(300);
  if (error) return safeError();
  return NextResponse.json({ success: true, testers: data || [] });
}

export async function PATCH(req: NextRequest) {
  const a = await requireBetaAdmin();
  if (a.error) return a.error;
  try {
    const b = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of ["status", "notes", "tester_type", "weekly_required_tests"]) if (k in b) updates[k] = b[k];
    const { data, error } = await getAdminDatabaseClient().from("beta_testers").update(updates).eq("id", b.id).select(BETA_TESTER_MUTATION_FIELDS).single();
    if (error) throw error;
    return NextResponse.json({ success: true, tester: data });
  } catch (e) {
    console.error(e);
    return safeError();
  }
}

export async function POST(req: NextRequest) {
  const a = await requireBetaAdmin();
  if (a.error) return a.error;
  const b = await req.json().catch(() => ({}));
  if (b.action === "assign_weekly" && b.testerId) return NextResponse.json({ success: true, result: await assignWeeklyBetaTasksForTester(b.testerId) });
  return safeError("Unsupported action", 400);
}
