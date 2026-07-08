import { supabaseAdmin } from "@/lib/supabase-admin";
import { repairBetaAccessForEmail, syncUserBetaAccess } from "@/lib/beta/programAccess";
import { sendBetaRemindersForActiveTesters, sendTestWeeklyCompletionEmail } from "@/lib/beta/reminderEmails";
import {
  getWeeklyBetaEnabled,
  getWeeklyBetaE2ETestModeEnabled,
  getCurrentWeekStart,
  setWeeklyBetaEnabled as setWeeklyBetaEnabledFlag,
  setWeeklyBetaE2ETestModeEnabled as setWeeklyBetaE2ETestModeEnabledFlag,
  getOrCreateWeeklyBetaSessionForUser,
  getOrCreateWeeklyBetaSessionsForActiveTesters,
  createTestWeeklyBetaSession,
  getCurrentTestWeeklyBetaSessionForUser,
  getOrCreateCurrentTestWeeklyBetaSessionForUser,
  resetTestWeeklyBetaSession,
  deleteTestWeeklyBetaSession,
  weeklySessionToVirtualAssignment,
} from "@/lib/beta/weeklyTasks";
import { getBetaGiveawayEligibilityForEmail } from "@/lib/beta-giveaway-eligibility";
import { sendRawBrandedEmail } from "@/lib/email";

export async function getBetaGiveawayOverview() {
  const [applications, testers, sessions, feedback, bugs, signups] = await Promise.all([
    supabaseAdmin.from("beta_applications").select("id,status").limit(1000),
    supabaseAdmin.from("beta_testers").select("id,status").limit(1000),
    supabaseAdmin.from("beta_test_sessions").select("id,status,test_mode,completed_steps").limit(1000),
    supabaseAdmin.from("beta_feedback").select("id,test_mode").limit(1000),
    supabaseAdmin.from("beta_bug_reports").select("id,status,priority,severity").limit(1000),
    supabaseAdmin.from("launch_waitlist_signups").select("id,email,wants_giveaway,giveaway_status,followed_social,social_platform,duplicate_flag").limit(1000),
  ]);
  const sessionsData = sessions.data ?? [];
  const entries = await Promise.all((signups.data ?? []).map(async (e: any) => calculateGiveawayEntries(e)));
  return {
    totalApplicants: applications.data?.length ?? 0,
    approvedTesters: (testers.data ?? []).filter((t: any) => ["approved", "active"].includes(t.status)).length,
    activeTesters: (testers.data ?? []).filter((t: any) => t.status === "active").length,
    weeklySessionsStarted: sessionsData.filter((s: any) => !s.test_mode && s.status !== "not_started").length,
    weeklySessionsCompleted: sessionsData.filter((s: any) => !s.test_mode && s.status === "completed").length,
    testSessions: sessionsData.filter((s: any) => s.test_mode).length,
    feedbackSubmitted: feedback.data?.length ?? 0,
    bugReports: bugs.data?.length ?? 0,
    prizeReadyTesters: entries.filter((e) => e.prizeReady).length,
    totalGiveawayEntries: entries.reduce((sum, e) => sum + e.totalEntries, 0),
    needsReview: (signups.data ?? []).filter((e: any) => e.duplicate_flag || e.giveaway_status === "pending_verification").length,
  };
}


async function sendTestWeeklyBetaMessageForUser(userId: string, fallbackEmail: string | null | undefined, type: "weekly" | "reminder") {
  await getOrCreateCurrentTestWeeklyBetaSessionForUser(userId);
  const email = fallbackEmail?.trim();
  if (!email) throw new Error("Test recipient email is unavailable.");
  const subject = type === "weekly"
    ? "[TEST] Your weekly TheOutHaven beta test is ready"
    : "[TEST] Reminder: complete your weekly TheOutHaven beta test";
  const sendResult = await sendRawBrandedEmail({
    to: email,
    department: "support",
    subject,
    heading: subject,
    body: "This is a preview email for the weekly beta flow. It was sent only to the admin test recipient and does not affect real beta progress or giveaway eligibility.",
    cta: {
      label: "Continue Test Weekly Beta Task",
      url: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/user/dashboard/beta/weekly?test=1`,
    },
  });
  if (sendResult.status !== "sent") {
    return {
      sent: false,
      message: "Test email could not be sent because email service is not configured.",
    };
  }
  return {
    sent: true,
    message: type === "weekly"
      ? "Test weekly email sent. No real beta testers were contacted."
      : "Test reminder sent. No real beta testers were contacted.",
  };
}

export async function sendTestWeeklyBetaEmailForUser(userId: string, fallbackEmail?: string | null) {
  return sendTestWeeklyBetaMessageForUser(userId, fallbackEmail, "weekly");
}

export async function sendTestWeeklyBetaReminderForUser(userId: string, fallbackEmail?: string | null) {
  return sendTestWeeklyBetaMessageForUser(userId, fallbackEmail, "reminder");
}

export async function sendTestWeeklyBetaCompletionEmailForUser(userId: string, fallbackEmail?: string | null) {
  await getOrCreateCurrentTestWeeklyBetaSessionForUser(userId);
  return sendTestWeeklyCompletionEmail({
    to: fallbackEmail,
    completed: 5,
    required: 5,
  });
}

export async function getBetaApplications() { const { data, error } = await supabaseAdmin.from("beta_applications").select("*").order("created_at", { ascending: false }).limit(500); if (error) throw error; return data ?? []; }
export async function approveBetaApplicant(applicationId: string, actor?: any) {
  const { data: app, error } = await supabaseAdmin.from("beta_applications").select("*").eq("id", applicationId).maybeSingle(); if (error || !app) throw new Error("Application not found.");
  const synced = await syncUserBetaAccess({ email: app.email, name: app.full_name ?? app.name, phone: app.phone, testerType: app.tester_type ?? "user", applicationId, requestedBetaStatus: "approved", source: "giveaway_applications", adminUserId: actor?.user_id ?? null, actor });
  return { approved: true, synced };
}
export async function updateBetaAccessForUser(userId: string, status: string) { const { data, error } = await supabaseAdmin.from("beta_testers").update({ status, updated_at: new Date().toISOString() }).eq("user_id", userId).select("*"); if (error) throw error; return data ?? []; }
export async function getWeeklyBetaSettings() { return { weekly_beta_enabled: await getWeeklyBetaEnabled(), weekly_beta_e2e_test_mode_enabled: await getWeeklyBetaE2ETestModeEnabled() }; }
export async function setWeeklyBetaEnabled(enabled: boolean, updatedBy?: string | null) { return setWeeklyBetaEnabledFlag(enabled, updatedBy); }
export async function setWeeklyBetaE2ETestModeEnabled(enabled: boolean, updatedBy?: string | null) { return setWeeklyBetaE2ETestModeEnabledFlag(enabled, updatedBy); }
export { getOrCreateWeeklyBetaSessionForUser, getOrCreateWeeklyBetaSessionsForActiveTesters, createTestWeeklyBetaSession, getCurrentTestWeeklyBetaSessionForUser, getOrCreateCurrentTestWeeklyBetaSessionForUser, resetTestWeeklyBetaSession, deleteTestWeeklyBetaSession };
export async function sendWeeklyBetaEmail() { return sendBetaRemindersForActiveTesters("weekly_tasks"); }
export async function sendWeeklyBetaReminder() { return sendBetaRemindersForActiveTesters("midweek_reminder" as any); }
export async function sendTestWeeklyBetaEmail() { return { sent: false, message: "Use the weekly-beta API to send a test email to the current admin test session." }; }
export async function sendTestWeeklyBetaReminder() { return { sent: false, message: "Use the weekly-beta API to send a test reminder to the current admin test session." }; }
export async function getWeeklyBetaSessionsForAdmin() { const { data, error } = await supabaseAdmin.from("beta_test_sessions").select("*, beta_testers(email,name,full_name,status)").order("created_at", { ascending: false }).limit(500); if (error) throw error; return (data ?? []).map((session: any) => ({ ...session, weekly_completed_tests: Array.isArray(session.completed_steps) ? Math.min(session.completed_steps.length, 5) : 0, weekly_required_tests: 5, mode_label: session.test_mode ? "Test mode" : "Real" })); }
export async function getWeeklyBetaSessionDetail(id: string) { const { data, error } = await supabaseAdmin.from("beta_test_sessions").select("*").eq("id", id).maybeSingle(); if (error) throw error; return data; }
export async function saveBetaSearchRun(payload: any) { const { data, error } = await supabaseAdmin.from("beta_search_runs").insert(payload).select("*").single(); if (error) throw error; return data; }
export async function saveBetaSearchResults(rows: any[]) { const { data, error } = await supabaseAdmin.from("beta_search_results").insert(rows).select("*"); if (error) throw error; return data ?? []; }
export async function saveBetaFeedback(payload: any) { const { data, error } = await supabaseAdmin.from("beta_feedback").insert(payload).select("*").single(); if (error) throw error; return data; }
export async function getBetaFeedbackForAdmin() { const { data, error } = await supabaseAdmin.from("beta_feedback").select("*, beta_testers(email,name,full_name)").order("created_at", { ascending: false }).limit(500); if (error) throw error; return data ?? []; }
export async function getBetaBugReportsForAdmin() { const { data, error } = await supabaseAdmin.from("beta_bug_reports").select("*, beta_testers(email,name,full_name)").order("created_at", { ascending: false }).limit(500); if (error) throw error; return data ?? []; }
export async function calculateGiveawayEligibility(entry: any) { return getBetaGiveawayEligibilityForEmail(entry.email || ""); }
export async function calculateGiveawayEntries(entry: any) { const eligibility: any = await calculateGiveawayEligibility(entry); const prizeReady = Boolean(entry.wants_giveaway && !entry.duplicate_flag && entry.giveaway_status !== "disqualified" && eligibility?.weeklyTasksComplete && eligibility?.isBetaTester); const platform = String(entry.social_platform || "").toLowerCase(); const ig = Boolean(entry.followed_social && ["instagram", "both"].includes(platform)); const tiktok = Boolean(entry.followed_social && ["tiktok", "both"].includes(platform)); return { prizeReady, baseEntry: prizeReady ? 1 : 0, instagramBonus: ig ? 1 : 0, tiktokBonus: tiktok ? 1 : 0, totalEntries: prizeReady ? 1 + (ig ? 1 : 0) + (tiktok ? 1 : 0) : 0 }; }
export async function updateBonusFollowVerification(entryId: string, platform: "instagram" | "tiktok" | "both", verifiedBy?: string | null) { const { data, error } = await supabaseAdmin.from("launch_waitlist_signups").update({ followed_social: true, social_platform: platform, followed_social_verified_at: new Date().toISOString(), followed_social_verified_by: verifiedBy ?? null }).eq("id", entryId).select("*").single(); if (error) throw error; return data; }
export async function updatePrizeOutcome(entryId: string, status: string) { const { data, error } = await supabaseAdmin.from("launch_waitlist_signups").update({ giveaway_status: status, updated_at: new Date().toISOString() }).eq("id", entryId).select("*").single(); if (error) throw error; return data; }
export async function getWeeklyBetaCardForUser(userId: string, testMode = false) { const res = await getOrCreateWeeklyBetaSessionForUser(userId, testMode); return { ...res, assignment: weeklySessionToVirtualAssignment(res.session) }; }

export { syncUserBetaAccess };

export async function getActiveBetaUsersForAdmin() {
  const { data: testers, error } = await supabaseAdmin.from("beta_testers").select("*").in("status", ["active", "approved"]).order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  const profileCount = await supabaseAdmin.from("launch_waitlist_signups").select("id", { count: "exact", head: true }).eq("beta_application_status", "approved");
  console.info("ACTIVE_BETA_USERS_DIAGNOSTICS", { profileApprovedCount: profileCount.count ?? 0, betaTesterActiveCount: testers?.length ?? 0, excludedByRoleFilter: 0 });
  return testers ?? [];
}
