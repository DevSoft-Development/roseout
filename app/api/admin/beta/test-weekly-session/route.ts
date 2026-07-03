import { NextRequest, NextResponse } from "next/server";
import {
  createTestWeeklyBetaSession,
  getCurrentTestWeeklyBetaSessionForUser,
  resetTestWeeklyBetaSession,
  deleteTestWeeklyBetaSession,
  getWeeklyBetaE2ETestModeEnabled,
} from "@/lib/beta/weeklyTasks";
import { requireBetaAdmin, safeError } from "../_shared";
import { sendRawBrandedEmail } from "@/lib/email";
import { sendTestWeeklyCompletionEmail } from "@/lib/beta/reminderEmails";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
async function sendTest(
  sessionId: string,
  type: "weekly" | "reminder",
  fallbackEmail?: string | null,
) {
  const { data: s } = await supabaseAdmin
    .from("beta_test_sessions")
    .select("*, beta_testers(email,name)")
    .eq("id", sessionId)
    .eq("test_mode", true)
    .maybeSingle();
  if (!s) throw new Error("Test session not found.");
  const email = s.beta_testers?.email || fallbackEmail;
  if (!email) throw new Error("Test recipient email is unavailable.");
  const subject =
    type === "weekly"
      ? "[TEST] Your weekly TheOutHaven beta test is ready"
      : "[TEST] Reminder: complete your weekly TheOutHaven beta test";
  await sendRawBrandedEmail({
    to: email,
    department: "support",
    subject,
    heading: subject,
    body: `This is a preview email for the weekly beta flow. It was sent only to the admin test recipient and does not affect real beta progress or giveaway eligibility.`,
    cta: {
      label: "Continue Test Weekly Beta Task",
      url: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/user/dashboard/beta/weekly?test=1`,
    },
  });
  return {
    sent: true,
    message:
      type === "weekly"
        ? "Test weekly email sent. No real beta testers were contacted."
        : "Test reminder sent. No real beta testers were contacted.",
  };
}
export async function POST(req: NextRequest) {
  const a = await requireBetaAdmin();
  if (a.error) return a.error;
  const b = await req.json().catch(() => ({}));
  try {
    const action = String(b.action || "create");
    const testModeEnabled = await getWeeklyBetaE2ETestModeEnabled();
    if (!testModeEnabled) return safeError("Turn on weekly beta test mode before creating or opening test sessions.", 409);
    if (action === "create") {
      const userId = String(b.user_id || a.adminUser?.user_id || "");
      if (!userId) return safeError("No test user found.", 400);
      return NextResponse.json({
        success: true,
        message: "Test weekly session is ready. It will not count toward real progress or giveaway eligibility.",
        ...(await createTestWeeklyBetaSession(userId)),
      });
    }
    if (action === "reset" || action === "delete") {
      let sessionId = String(b.session_id || "");
      if (!sessionId) {
        const userId = String(b.user_id || a.adminUser?.user_id || "");
        const session = userId ? await getCurrentTestWeeklyBetaSessionForUser(userId) : null;
        if (!session) {
          return action === "reset"
            ? safeError("Create a test weekly session first.", 404)
            : NextResponse.json({ success: true, message: "No test session found." });
        }
        sessionId = session.id;
      }
      return action === "reset"
        ? NextResponse.json({
            success: true,
            message: "Test weekly task reset. You can rerun the test now.",
            session: await resetTestWeeklyBetaSession(sessionId),
          })
        : NextResponse.json({
            success: true,
            message: "Test session deleted.",
            ...(await deleteTestWeeklyBetaSession(sessionId)),
          });
    }
    if (action === "send_completion_email") {
      const userId = String(b.user_id || a.adminUser?.user_id || "");
      if (!userId) return safeError("No test user found.", 400);
      await createTestWeeklyBetaSession(userId);
      return NextResponse.json({
        success: true,
        ...(await sendTestWeeklyCompletionEmail({
          to: a.adminUser?.email,
          name: a.adminUser?.full_name,
          completed: 5,
          required: 5,
        })),
      });
    }
    if (action === "send_weekly_email" || action === "send_reminder") {
      let sessionId = String(b.session_id || "");
      if (!sessionId) {
        const made = await createTestWeeklyBetaSession(
          String(b.user_id || a.adminUser?.user_id || ""),
        );
        sessionId = made.session.id;
      }
      return NextResponse.json({
        success: true,
        ...(await sendTest(
          sessionId,
          action === "send_weekly_email" ? "weekly" : "reminder",
          a.adminUser?.email,
        )),
      });
    }
    return safeError("Unsupported test action.", 400);
  } catch (e: any) {
    return safeError(e.message || "Test weekly session action failed.", 500);
  }
}
