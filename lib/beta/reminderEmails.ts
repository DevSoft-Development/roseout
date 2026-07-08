import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendRawBrandedEmail } from "@/lib/email";
import { buildSiteUrl } from "@/lib/site-url";
import { getCurrentWeekStart } from "./weeklyTasks";
import type { BetaReminderType as PublicBetaReminderType } from "@/types/beta";
type BetaReminderType = PublicBetaReminderType;

export const CANONICAL_BETA_REMINDER_TYPES: BetaReminderType[] = [
  "weekly_tasks",
  "midweek_reminder",
  "daily_incomplete_reminder",
  "friday_final_reminder",
  "completed_weekly_goal",
];

const reminderTypeMap: Record<string, BetaReminderType> = {
  weekly_tasks: "weekly_tasks",
  midweek_reminder: "midweek_reminder",
  daily_incomplete_reminder: "daily_incomplete_reminder",
  friday_final_reminder: "friday_final_reminder",
  completed_weekly_goal: "completed_weekly_goal",
  weekly_start: "weekly_tasks",
  midweek_nudge: "midweek_reminder",
  daily_incomplete: "daily_incomplete_reminder",
  friday_final: "friday_final_reminder",
};
async function shouldSendBetaReminder(
  testerId: string,
  reminderType: BetaReminderType,
  weekStart: string,
) {
  const { data } = await supabaseAdmin
    .from("beta_email_reminders")
    .select("id")
    .eq("tester_id", testerId)
    .eq("reminder_type", reminderType)
    .eq("week_start", weekStart)
    .in("status", ["sent", "pending"])
    .limit(1);
  return !(data && data.length);
}
const subjects: Record<BetaReminderType, string> = {
  weekly_tasks: "Your weekly TheOutHaven beta test is ready",
  midweek_reminder: "Your weekly TheOutHaven beta test is ready",
  daily_incomplete_reminder: "Your weekly TheOutHaven beta test is ready",
  friday_final_reminder: "Your weekly TheOutHaven beta test is ready",
  completed_weekly_goal: "Your weekly TheOutHaven beta task is complete",
};
type EmailInput = { name?: string; completed: number; required?: number };
function reminderBody(input: EmailInput) {
  const required = input.required ?? 5;
  const dashboard = buildSiteUrl("/user/dashboard/beta");
  return `Hi ${input.name || "there"},

This week, complete your 5 beta steps in one guided test. Write your own outing, review the results, choose what fits, and tell us what worked.

Continue Weekly Beta Test:
${dashboard}

Progress: ${input.completed}/${required} steps complete.

Completing your weekly beta test helps you become prize-ready for the $500 gift card giveaway. Optional Instagram and TikTok follows can add bonus entries.

TheOutHaven Team`;
}
export function buildWeeklyCompletionEmailBody(input: { name?: string; completed: number; required: number }) {
  const dashboard = buildSiteUrl("/user/dashboard/beta");
  return `Hi ${input.name || "there"},

You completed this week’s TheOutHaven beta task.

Weekly progress: ${input.completed} of ${input.required} steps complete

Thank you for helping improve TheOutHaven.

Look out for next week’s task.

View your beta dashboard:
${dashboard}

TheOutHaven Team`;
}
export async function sendTestWeeklyCompletionEmail({
  to,
  name,
  completed = 5,
  required = 5,
}: {
  to?: string | null;
  name?: string | null;
  completed?: number;
  required?: number;
}) {
  const email = to?.trim();
  if (!email) throw new Error("Test recipient email is unavailable.");
  const result = await sendRawBrandedEmail({
    to: email,
    department: "support",
    subject: "[Test] Your weekly TheOutHaven beta task is complete",
    heading: "Weekly beta task completed",
    preview: "Thanks for helping improve TheOutHaven. Look out for next week’s task.",
    body: buildWeeklyCompletionEmailBody({ name: name || undefined, completed, required }),
    cta: {
      label: "View Beta Dashboard",
      url: buildSiteUrl("/user/dashboard/beta"),
    },
    replyTo: "support@theouthaven.com",
  });
  if (result.status !== "sent") {
    return {
      sent: false,
      status: result.status,
      message: "Email provider is not configured in this environment.",
    };
  }
  return {
    sent: true,
    status: "sent",
    message: "Test completion email sent. No real beta testers were contacted.",
  };
}

export async function sendBetaReminderEmail({
  testerId,
  reminderType,
  weekStart = getCurrentWeekStart(),
}: {
  testerId: string;
  reminderType: BetaReminderType;
  weekStart?: string;
}) {
  if (!(await shouldSendBetaReminder(testerId, reminderType, weekStart)))
    return { status: "skipped" };
  const { data: tester } = await supabaseAdmin
    .from("beta_testers")
    .select("*")
    .eq("id", testerId)
    .maybeSingle();
  if (!tester?.email) return { status: "skipped" };
  const links: any[] = [];
  const required = Number(tester.weekly_required_tests || 5);
  const rawCompleted = Number(tester.weekly_completed_tests || 0);
  const completed = reminderType === "completed_weekly_goal"
    ? required
    : Math.min(required, Math.max(0, rawCompleted));
  const subject = subjects[reminderType];
  const isCompleted = reminderType === "completed_weekly_goal";
  const mailBody = isCompleted
    ? buildWeeklyCompletionEmailBody({ name: tester.name, completed, required })
    : reminderBody({
        name: tester.name,
        completed,
        required,
      });
  const inserted = await supabaseAdmin
    .from("beta_email_reminders")
    .insert({
      tester_id: testerId,
      email: tester.email,
      reminder_type: reminderType,
      subject,
      status: "pending",
      week_start: weekStart,
      weekly_required_tests: required,
      weekly_completed_tests: completed,
      incomplete_task_count: links.length,
      task_links: links,
    })
    .select("id")
    .single();
  const result = await sendRawBrandedEmail({
    to: tester.email,
    department: "support",
    subject,
    heading: isCompleted ? "Weekly beta task completed" : subject,
    preview: isCompleted
      ? "Thanks for helping improve TheOutHaven. Look out for next week’s task."
      : undefined,
    body: mailBody,
    cta: {
      label: isCompleted ? "View Beta Dashboard" : "Continue Weekly Beta Test",
      url: buildSiteUrl("/user/dashboard/beta"),
    },
    replyTo: "support@theouthaven.com",
  });
  if (isCompleted && result.status === "error") {
    console.error("WEEKLY_BETA_COMPLETION_EMAIL_SEND_FAILED", {
      testerId,
      weekStart,
      error: result.error || null,
    });
  }
  const status =
    result.status === "error"
      ? "failed"
      : result.status === "sent"
        ? "sent"
        : "skipped";
  await supabaseAdmin
    .from("beta_email_reminders")
    .update({
      status,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      error_message: result.error ?? null,
    })
    .eq("id", inserted.data?.id);
  return { status };
}

export async function sendBetaRemindersForActiveTesters(
  reminderType: PublicBetaReminderType | BetaReminderType | string,
) {
  const mapped = reminderTypeMap[String(reminderType)] || "weekly_tasks";
  const { data } = await supabaseAdmin
    .from("beta_testers")
    .select("id")
    .in("status", ["active", "approved"])
    .limit(1000);
  const results = [];
  for (const tester of data || []) {
    results.push(
      await sendBetaReminderEmail({
        testerId: tester.id,
        reminderType: mapped,
      }),
    );
  }
  return results;
}
