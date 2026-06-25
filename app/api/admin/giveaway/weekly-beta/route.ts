import { NextRequest, NextResponse } from "next/server";
import { requireBetaAdmin, safeError } from "@/app/api/admin/beta/_shared";
import {
  createTestWeeklyBetaSession,
  deleteTestWeeklyBetaSession,
  getOrCreateWeeklyBetaSessionsForActiveTesters,
  getWeeklyBetaSettings,
  resetTestWeeklyBetaSession,
  sendWeeklyBetaEmail,
  sendWeeklyBetaReminder,
  setWeeklyBetaEnabled,
} from "@/lib/giveaway/betaProgram";

export async function GET() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  return NextResponse.json({ success: true, ...(await getWeeklyBetaSettings()) });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  if (typeof body.weekly_beta_enabled === "boolean") {
    await setWeeklyBetaEnabled(body.weekly_beta_enabled, auth.adminUser?.user_id ?? null);
  }
  return NextResponse.json({ success: true, message: "Weekly beta controls updated.", ...(await getWeeklyBetaSettings()) });
}

export async function POST(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "create_real_sessions");
  try {
    if (action === "create_real_sessions" || action === "assign") {
      const result = await getOrCreateWeeklyBetaSessionsForActiveTesters();
      return NextResponse.json({ success: true, message: `Created ${result.created}; already existed ${result.alreadyExisted}; skipped ${result.skipped}.`, ...result });
    }
    if (action === "send_weekly_email") {
      const results = await sendWeeklyBetaEmail();
      return NextResponse.json({ success: true, message: "Weekly beta email job completed.", total: results.length, sent: results.filter((r: any) => r.status === "sent").length });
    }
    if (action === "send_reminder") {
      const results = await sendWeeklyBetaReminder();
      return NextResponse.json({ success: true, message: "Weekly beta reminder job completed.", total: results.length, sent: results.filter((r: any) => r.status === "sent").length });
    }
    if (["create", "create_test_session"].includes(action)) {
      const userId = String(body.user_id || auth.adminUser?.user_id || "");
      if (!userId) return safeError("No test user found.", 400);
      return NextResponse.json({ success: true, message: "Test weekly session ready.", ...(await createTestWeeklyBetaSession(userId)) });
    }
    if (["reset", "delete"].includes(action)) {
      let sessionId = String(body.session_id || "");
      if (!sessionId) {
        const made = await createTestWeeklyBetaSession(String(body.user_id || auth.adminUser?.user_id || ""));
        sessionId = made.session.id;
      }
      if (action === "reset") return NextResponse.json({ success: true, message: "Test weekly task reset.", session: await resetTestWeeklyBetaSession(sessionId) });
      return NextResponse.json({ success: true, message: "Test session deleted.", ...(await deleteTestWeeklyBetaSession(sessionId)) });
    }
    return safeError("Unsupported weekly beta action.", 400);
  } catch (e: any) {
    return safeError(e.message || "Weekly beta action failed.", 500);
  }
}
