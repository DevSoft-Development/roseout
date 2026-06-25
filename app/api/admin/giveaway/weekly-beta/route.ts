import { NextRequest, NextResponse } from "next/server";
import { requireBetaAdmin, safeError } from "@/app/api/admin/beta/_shared";
import {
  createTestWeeklyBetaSession,
  deleteTestWeeklyBetaSession,
  getCurrentTestWeeklyBetaSessionForUser,
  getOrCreateWeeklyBetaSessionsForActiveTesters,
  getWeeklyBetaSettings,
  resetTestWeeklyBetaSession,
  sendTestWeeklyBetaEmailForUser,
  sendTestWeeklyBetaReminderForUser,
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
  if (typeof body.weekly_beta_enabled !== "boolean") return safeError("weekly_beta_enabled must be true or false.", 400);
  try {
    await setWeeklyBetaEnabled(body.weekly_beta_enabled, auth.adminUser?.user_id ?? null);
    const settings = await getWeeklyBetaSettings();
    return NextResponse.json({ success: true, weekly_beta_enabled: settings.weekly_beta_enabled, message: settings.weekly_beta_enabled ? "Weekly beta task turned on." : "Weekly beta task turned off." });
  } catch {
    return safeError("We couldn’t update the weekly beta setting. Please try again.", 500);
  }
}

function currentAdminUserId(auth: any) {
  return String(auth.adminUser?.user_id || "");
}

export async function POST(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "create_real_sessions");
  try {
    if (action === "set_weekly_enabled") {
      if (typeof body.weekly_beta_enabled !== "boolean") return safeError("weekly_beta_enabled must be true or false.", 400);
      await setWeeklyBetaEnabled(body.weekly_beta_enabled, auth.adminUser?.user_id ?? null);
      const settings = await getWeeklyBetaSettings();
      return NextResponse.json({ success: true, weekly_beta_enabled: settings.weekly_beta_enabled, message: settings.weekly_beta_enabled ? "Weekly beta task turned on." : "Weekly beta task turned off." });
    }
    if (action === "create_real_sessions" || action === "assign") {
      const settings = await getWeeklyBetaSettings();
      if (!settings.weekly_beta_enabled) return safeError("Turn on the real weekly beta task before creating real sessions.", 409);
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

    const userId = currentAdminUserId(auth);
    if (["create_test_session", "send_test_email", "send_test_reminder", "reset_test_session", "delete_test_session"].includes(action) && !userId) return safeError("No test user found.", 400);

    if (action === "create_test_session") {
      const result = await createTestWeeklyBetaSession(userId);
      return NextResponse.json({ success: true, message: "Test weekly session is ready.", session_id: result.session.id, test_url: "/user/dashboard/beta/weekly?test=1", ...result });
    }
    if (action === "send_test_email") {
      return NextResponse.json({ success: true, ...(await sendTestWeeklyBetaEmailForUser(userId, auth.adminUser?.email)) });
    }
    if (action === "send_test_reminder") {
      return NextResponse.json({ success: true, ...(await sendTestWeeklyBetaReminderForUser(userId, auth.adminUser?.email)) });
    }
    if (action === "reset_test_session") {
      const session = await getCurrentTestWeeklyBetaSessionForUser(userId);
      if (!session) return safeError("Create a test weekly session first.", 404);
      return NextResponse.json({ success: true, message: "Test weekly task reset. You can rerun the test now.", session: await resetTestWeeklyBetaSession(session.id) });
    }
    if (action === "delete_test_session") {
      const session = await getCurrentTestWeeklyBetaSessionForUser(userId);
      if (!session) return NextResponse.json({ success: true, message: "No test session found." });
      return NextResponse.json({ success: true, message: "Test session deleted.", ...(await deleteTestWeeklyBetaSession(session.id)) });
    }
    return safeError("Unsupported weekly beta action.", 400);
  } catch (e: any) {
    console.error("GIVEAWAY_WEEKLY_BETA_ACTION_ERROR", {
      action,
      hasAdminUser: Boolean(auth.adminUser?.user_id),
      error: e instanceof Error ? e.message : String(e),
    });
    return safeError("Weekly beta action failed. Please try again.", 500);
  }
}
