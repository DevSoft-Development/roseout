import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentWeekStart } from "@/lib/beta/weeklyTasks";

export type BetaGiveawayEligibilityStatus = "not_beta_yet" | "pending_beta_tasks" | "eligible" | "ineligible";

export type BetaGiveawayEligibility = {
  isBetaTester: boolean;
  betaStatus: string | null;
  weeklyRequiredTasks: number;
  completedThisWeek: number;
  requiredThisWeek: number;
  weeklyTasksComplete: boolean;
  eligibilityStatus: BetaGiveawayEligibilityStatus;
  reason: string;
};

const DEFAULT_REQUIRED_TASKS = 5;

export async function getBetaGiveawayEligibilityForEmail(email: string): Promise<BetaGiveawayEligibility> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      isBetaTester: false,
      betaStatus: null,
      weeklyRequiredTasks: 0,
      completedThisWeek: 0,
      requiredThisWeek: 0,
      weeklyTasksComplete: true,
      eligibilityStatus: "not_beta_yet",
      reason: "No email provided.",
    };
  }

  const { data: tester, error: testerError } = await supabaseAdmin
    .from("beta_testers")
    .select("id,status,weekly_required_tests,weekly_completed_tests,current_week_start")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (testerError || !tester) {
    return {
      isBetaTester: false,
      betaStatus: null,
      weeklyRequiredTasks: 0,
      completedThisWeek: 0,
      requiredThisWeek: 0,
      weeklyTasksComplete: true,
      eligibilityStatus: "not_beta_yet",
      reason: "Not approved as a beta tester yet.",
    };
  }

  const betaStatus = tester.status ? String(tester.status) : null;
  if (betaStatus !== "active") {
    return {
      isBetaTester: true,
      betaStatus,
      weeklyRequiredTasks: Number(tester.weekly_required_tests || DEFAULT_REQUIRED_TASKS),
      completedThisWeek: 0,
      requiredThisWeek: Number(tester.weekly_required_tests || DEFAULT_REQUIRED_TASKS),
      weeklyTasksComplete: false,
      eligibilityStatus: "ineligible",
      reason: `Beta tester status is ${betaStatus || "unknown"}.`,
    };
  }

  const weekStart = getCurrentWeekStart();
  const requiredThisWeek = Number(tester.weekly_required_tests || DEFAULT_REQUIRED_TASKS);
  const { data: assignments, error: assignmentsError } = await supabaseAdmin
    .from("beta_task_assignments")
    .select("id,status,completed_at,counts_toward_weekly_goal")
    .eq("tester_id", tester.id)
    .eq("assigned_week_start", weekStart)
    .eq("counts_toward_weekly_goal", true);

  if (assignmentsError) {
    const completedFromTester = Number(tester.weekly_completed_tests || 0);
    const completeFromTester = completedFromTester >= requiredThisWeek;
    return {
      isBetaTester: true,
      betaStatus,
      weeklyRequiredTasks: requiredThisWeek,
      completedThisWeek: completedFromTester,
      requiredThisWeek,
      weeklyTasksComplete: completeFromTester,
      eligibilityStatus: completeFromTester ? "eligible" : "pending_beta_tasks",
      reason: completeFromTester ? "Weekly beta task goal complete." : "Weekly beta tasks are still pending.",
    };
  }

  const completedThisWeek = (assignments || []).filter((assignment) => assignment.status === "completed" || Boolean(assignment.completed_at)).length;
  const weeklyTasksComplete = completedThisWeek >= requiredThisWeek;
  return {
    isBetaTester: true,
    betaStatus,
    weeklyRequiredTasks: requiredThisWeek,
    completedThisWeek,
    requiredThisWeek,
    weeklyTasksComplete,
    eligibilityStatus: weeklyTasksComplete ? "eligible" : "pending_beta_tasks",
    reason: weeklyTasksComplete ? "Weekly beta task goal complete." : `Weekly beta tasks pending: ${completedThisWeek} / ${requiredThisWeek} completed.`,
  };
}
