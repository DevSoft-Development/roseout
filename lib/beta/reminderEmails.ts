import { supabaseAdmin } from "@/lib/supabaseAdmin";
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
  completed_weekly_goal: "Thank you — you completed your weekly beta test",
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
function completedBody(name?: string) {
  const dashboard = buildSiteUrl("/user/dashboard/beta");
  return `Hi ${name || "there"},

Thank you for completing your TheOutHaven weekly beta tasks.

Your weekly beta task goal is complete for this week, and your progress has been recorded.

Completing your weekly beta tasks helps you become prize-ready for the $500 gift card giveaway. Optional Instagram and TikTok follows can add bonus entries.

Open your beta dashboard:
${dashboard}

Thank you for helping test and improve TheOutHaven.

TheOutHaven Team`;
}
export async function sendBetaReminderEmail({
  testerId,
  reminderType,
}: {
  testerId: string;
  reminderType: BetaReminderType;
}) {
  const weekStart = getCurrentWeekStart();
  if (!(await shouldSendBetaReminder(testerId, reminderType, weekStart)))
    return { status: "skipped" };
  const { data: tester } = await supabaseAdmin
    .from("beta_testers")
    .select("*")
    .eq("id", testerId)
    .maybeSingle();
  if (!tester?.email) return { status: "skipped" };
  const links: any[] = [];
  const completed = Number(tester.weekly_completed_tests || 0);
  const subject = subjects[reminderType];
  const isCompleted = reminderType === "completed_weekly_goal";
  const mailBody = isCompleted
    ? completedBody(tester.name)
    : reminderBody({
        name: tester.name,
        completed,
        required: tester.weekly_required_tests || 5,
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
      weekly_required_tests: tester.weekly_required_tests || 5,
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
    heading: isCompleted ? "Weekly beta tasks completed" : subject,
    body: mailBody,
    cta: {
      label: "Continue Weekly Beta Test",
      url: buildSiteUrl("/user/dashboard/beta"),
    },
    replyTo: "support@theouthaven.com",
  });
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
