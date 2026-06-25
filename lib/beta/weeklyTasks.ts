import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { BetaTesterType } from "@/types/beta";

export function getCurrentWeekStart(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

const rotating: Record<string, string[]> = {
  user: [
    "/create?betaTask=user-weekly",
    "/locations?betaTask=user-location-review",
  ],
  location_owner: [
    "/location/dashboard?betaTask=owner-dashboard",
    "/claim?betaTask=claim-flow",
    "/location/dashboard/reservations?betaTask=reservation-dashboard",
    "/location/dashboard/embed?betaTask=embed-code",
  ],
  ambassador: [
    "/admin/dashboard/crm?betaTask=ambassador-crm",
    "/admin/dashboard/knowledge-base?betaTask=ambassador-kb",
    "/admin/dashboard/settings/promo-codes?betaTask=promo-code-test",
  ],
  experience_team: [
    "/admin/dashboard/beta?tab=feedback",
    "/admin/dashboard/beta?tab=bugs",
    "/admin/dashboard/beta?tab=search-speed",
    "/admin/dashboard/logs",
  ],
  admin: [
    "/admin/dashboard/beta",
    "/admin/dashboard/beta?tab=search-speed",
    "/admin/dashboard/search-health",
    "/admin/dashboard/import",
    "/admin/dashboard/logs",
  ],
  superadmin: [
    "/admin/dashboard/beta",
    "/admin/dashboard/beta?tab=search-speed",
    "/admin/dashboard/search-health",
    "/admin/dashboard/import",
    "/admin/dashboard/logs",
  ],
};
export function getDefaultBetaTaskLinks(testerType: string) {
  return rotating[testerType] ?? rotating.user;
}
// Deprecated beta_tasks template labels retained only for server-side historical compatibility.
// Do not render these in admin giveaway or user beta UI and do not assign them.
export function getDefaultBetaPromptTasks() {
  return [
    "Search quality test",
    "Test group night search",
    "Search speed test",
    "Try your own search prompt",
    "Create plan flow test",
  ];
}

type BetaTaskRow = {
  id?: string;
  title: string;
  [key: string]: unknown;
};

const starterWeeklyBetaTasks = [
  {
    title: "Run a search",
    description:
      "Try one full-sentence search such as “birthday dinner in Queens” or “date night in Long Island” and check if the results make sense.",
    feature_area: "search",
    priority: "high",
    test_url: "/create",
  },
  {
    title: "Test a location page",
    description:
      "Open one result card and confirm the photo, address, vibe, and details look correct.",
    feature_area: "locations",
    priority: "medium",
    test_url: "/create",
  },
  {
    title: "Try a nearby-area search",
    description:
      "Search for a place or outing near your area and check whether the results are close enough.",
    feature_area: "location_search",
    priority: "high",
    test_url: "/create",
  },
  {
    title: "Submit feedback",
    description:
      "Use the beta feedback form to tell us what worked, what felt off, or what results should improve.",
    feature_area: "feedback",
    priority: "high",
    test_url: "/user/dashboard/beta/feedback",
  },
  {
    title: "Report a bug or confirm none",
    description:
      "If something breaks, report it. If nothing breaks, submit a quick note saying the test worked.",
    feature_area: "bug_report",
    priority: "medium",
    test_url: "/user/dashboard/beta/report-bug",
  },
] as const;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeWeekStart(weekStart?: string | Date | null) {
  if (!weekStart) return getCurrentWeekStart();
  const date = weekStart instanceof Date ? weekStart : new Date(weekStart);
  if (Number.isNaN(date.getTime())) return getCurrentWeekStart();
  return getCurrentWeekStart(date);
}

export async function createStarterWeeklyTasks({
  weekStart,
  createdBy,
}: {
  weekStart?: string | Date | null;
  createdBy?: string | null;
} = {}) {
  const normalizedWeekStart = normalizeWeekStart(weekStart);
  const dueAt = addDays(new Date(`${normalizedWeekStart}T00:00:00.000Z`), 7).toISOString();
  const titles = starterWeeklyBetaTasks.map((task) => task.title);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("beta_tasks")
    .select("*")
    .in("title", titles)
    .eq("tester_type", "user")
    .in("status", ["active", "draft"]);
  if (existingError) throw existingError;

  const existingTasks = (existing ?? []) as BetaTaskRow[];
  const existingTitles = new Set(existingTasks.map((task) => task.title));
  const rows = starterWeeklyBetaTasks
    .filter((task) => !existingTitles.has(task.title))
    .map((task) => ({
      title: task.title,
      description: task.description,
      tester_type: "user",
      feature_area: task.feature_area,
      priority: task.priority,
      status: "active",
      due_at: dueAt,
      test_url: task.test_url,
      button_label: "Start Task",
      estimated_minutes: 10,
      instructions: task.description,
      prompt_mode: "predefined",
      allow_custom_prompt: false,
      custom_prompt_required: false,
      created_by: createdBy ?? null,
    }));

  let created: BetaTaskRow[] = [];
  if (rows.length) {
    const { data, error } = await supabaseAdmin
      .from("beta_tasks")
      .insert(rows)
      .select("*");
    if (error) throw error;
    created = (data ?? []) as BetaTaskRow[];
  }

  const taskByTitle = new Map(
    [...existingTasks, ...created].map((task) => [task.title, task]),
  );

  return {
    weekStart: normalizedWeekStart,
    createdCount: created.length,
    tasks: titles.map((title) => taskByTitle.get(title)).filter(Boolean),
  };
}

export const WEEKLY_BETA_TASK_TITLE = "Your 5 Beta Steps This Week";
export const WEEKLY_BETA_TASK_SUBTITLE =
  "Write your own outing sentence, review real TheOutHaven results, choose what fits, and tell us what worked.";

function getProgramWeek(weekStart: string) {
  const firstWeekStart = new Date("2026-06-22T00:00:00.000Z");
  const current = new Date(`${weekStart}T00:00:00.000Z`);
  const diff = Math.floor((current.getTime() - firstWeekStart.getTime()) / 604800000) + 1;
  return Math.min(4, Math.max(1, Number.isFinite(diff) ? diff : 1));
}

function getWeekEnd(weekStart: string) {
  return addDays(new Date(`${weekStart}T00:00:00.000Z`), 6)
    .toISOString()
    .slice(0, 10);
}

export async function getOrCreateWeeklyBetaSessionForTester(testerId: string) {
  const weekStart = getCurrentWeekStart();
  const weekNumber = getProgramWeek(weekStart);
  const { data: tester } = await supabaseAdmin
    .from("beta_testers")
    .select("id,user_id,weekly_completed_tests,weekly_required_tests,status")
    .eq("id", testerId)
    .maybeSingle();
  if (!tester) return { session: null, weekStart, weekNumber };

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("beta_test_sessions")
    .select("*")
    .eq("tester_id", testerId)
    .eq("week_start_date", weekStart)
    .eq("test_mode", false)
    .maybeSingle();
  if (existingError) throw existingError;

  const payload = {
    user_id: tester.user_id ?? null,
    tester_id: testerId,
    week_number: weekNumber,
    week_start_date: weekStart,
    week_end_date: getWeekEnd(weekStart),
    status: "not_started",
    completed_steps: [],
    test_mode: false,
  };

  const session = existing
    ? existing
    : (
        await supabaseAdmin
          .from("beta_test_sessions")
          .insert(payload)
          .select("*")
          .single()
      ).data;

  const completedSteps = Array.isArray(session?.completed_steps)
    ? session.completed_steps.length
    : 0;
  await supabaseAdmin
    .from("beta_testers")
    .update({
      current_week_start: weekStart,
      weekly_completed_tests: completedSteps,
      weekly_required_tests: 5,
    })
    .eq("id", testerId);

  return { session, weekStart, weekNumber };
}

export function weeklySessionToVirtualAssignment(session: any) {
  const completed = Array.isArray(session?.completed_steps)
    ? Math.min(5, session.completed_steps.length)
    : 0;
  const status = session?.status === "completed"
    ? "completed"
    : completed > 0
      ? "in_progress"
      : "assigned";
  return {
    id: session?.id ?? "weekly-beta-session",
    real_assignment_id: null,
    is_virtual_weekly_session: true,
    status,
    test_mode: Boolean(session?.test_mode),
    week_start_date: session?.week_start_date,
    week_number: session?.week_number,
    assigned_week_start: session?.week_start_date,
    completed_steps_count: completed,
    total_steps: 5,
    beta_tasks: {
      id: session?.id ?? "weekly-beta-session-template",
      title: WEEKLY_BETA_TASK_TITLE,
      description: WEEKLY_BETA_TASK_SUBTITLE,
      instructions: WEEKLY_BETA_TASK_SUBTITLE,
      test_url: "/user/dashboard/beta",
      button_label: status === "assigned" ? "Start Weekly Beta Test" : "Continue Weekly Beta Test",
      prompt_mode: "custom",
      allow_custom_prompt: true,
      custom_prompt_required: true,
    },
  };
}

export async function assignWeeklyBetaTasksForTester(testerId: string) {
  const { session, weekStart } = await getOrCreateWeeklyBetaSessionForTester(testerId);
  return { assigned: session ? 1 : 0, weekStart, session };
}

export async function assignWeeklyBetaTasksForAllActiveTesters() {
  const { data } = await supabaseAdmin
    .from("beta_testers")
    .select("id")
    .eq("status", "active");
  const results = [];
  for (const tester of data ?? [])
    results.push(await assignWeeklyBetaTasksForTester(tester.id));
  return results;
}

export function createInviteCode() {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function getFeatureFlagEnabled(key: string) {
  const { data } = await supabaseAdmin.from("feature_flags").select("enabled").eq("key", key).maybeSingle();
  return Boolean((data as any)?.enabled);
}

export async function setFeatureFlagEnabled(key: string, enabled: boolean, updatedBy?: string | null) {
  const now = new Date().toISOString();
  const payload: any = { key, name: key, enabled, rollout_percentage: enabled ? 100 : 0, category: "beta", environment: "production", updated_at: now };
  const { data, error } = await supabaseAdmin.from("feature_flags").upsert(payload, { onConflict: "key" }).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export const getWeeklyBetaEnabled = () => getFeatureFlagEnabled("weekly_beta_enabled");
export const setWeeklyBetaEnabled = (enabled: boolean, updatedBy?: string | null) => setFeatureFlagEnabled("weekly_beta_enabled", enabled, updatedBy);
export const getWeeklyBetaE2ETestModeEnabled = () => getFeatureFlagEnabled("weekly_beta_e2e_test_mode_enabled");
export const setWeeklyBetaE2ETestModeEnabled = (enabled: boolean, updatedBy?: string | null) => setFeatureFlagEnabled("weekly_beta_e2e_test_mode_enabled", enabled, updatedBy);

export function getCurrentBetaWeekNumber() { return getProgramWeek(getCurrentWeekStart()); }

export async function getOrCreateWeeklyBetaSessionForUser(userId: string, testMode = false) {
  const weekStart = getCurrentWeekStart();
  const weekNumber = getProgramWeek(weekStart);
  const { data: tester } = await supabaseAdmin.from("beta_testers").select("id,user_id,status").eq("user_id", userId).maybeSingle();
  const query = supabaseAdmin.from("beta_test_sessions").select("*").eq("week_start_date", weekStart).eq("test_mode", testMode).eq("user_id", userId);
  const { data: existing, error } = await query.maybeSingle();
  if (error) throw error;
  if (existing) return { session: existing, created: false, weekStart, weekNumber };
  const { data, error: insertError } = await supabaseAdmin.from("beta_test_sessions").insert({ user_id: userId, tester_id: tester?.id ?? null, week_number: weekNumber, week_start_date: weekStart, week_end_date: getWeekEnd(weekStart), status: "not_started", completed_steps: [], test_mode: testMode }).select("*").single();
  if (insertError) throw insertError;
  return { session: data, created: true, weekStart, weekNumber };
}

export async function getOrCreateWeeklyBetaSessionsForActiveTesters() {
  const enabled = await getWeeklyBetaEnabled();
  if (!enabled) throw new Error("Turn on the real weekly beta task before creating real sessions.");
  const { data: testers } = await supabaseAdmin.from("beta_testers").select("id,user_id,status").in("status", ["active", "approved"]);
  let created = 0, alreadyExisted = 0, skipped = 0; const errors: string[] = [];
  for (const tester of testers ?? []) {
    try {
      if (!tester.user_id) { skipped++; continue; }
      const res = await getOrCreateWeeklyBetaSessionForUser(tester.user_id, false);
      if (res.created) created++; else alreadyExisted++;
    } catch (e: any) { errors.push(e.message || "Unknown error"); }
  }
  return { created, alreadyExisted, skipped, errors, testerCount: testers?.length ?? 0 };
}


export async function getCurrentTestWeeklyBetaSessionForUser(userId: string) {
  const weekStart = getCurrentWeekStart();
  const { data, error } = await supabaseAdmin
    .from("beta_test_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start_date", weekStart)
    .eq("test_mode", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOrCreateCurrentTestWeeklyBetaSessionForUser(userId: string) {
  const result = await getOrCreateWeeklyBetaSessionForUser(userId, true);
  return result.session;
}

export async function createTestWeeklyBetaSession(userId: string) { return getOrCreateWeeklyBetaSessionForUser(userId, true); }

export async function resetTestWeeklyBetaSession(sessionId: string) {
  const { data: session, error } = await supabaseAdmin.from("beta_test_sessions").select("id,test_mode").eq("id", sessionId).maybeSingle();
  if (error || !session || !(session as any).test_mode) throw new Error("Only test-mode sessions can be reset.");
  const { data: runs } = await supabaseAdmin.from("beta_search_runs").select("id").eq("beta_session_id", sessionId).eq("test_mode", true);
  const runIds = (runs ?? []).map((r: any) => r.id);
  if (runIds.length) await supabaseAdmin.from("beta_search_results").delete().in("beta_search_run_id", runIds).eq("test_mode", true);
  if (runIds.length) await supabaseAdmin.from("beta_search_runs").delete().in("id", runIds).eq("test_mode", true);
  await supabaseAdmin.from("beta_feedback").delete().eq("beta_session_id", sessionId).eq("test_mode", true);
  const { data, error: updateError } = await supabaseAdmin.from("beta_test_sessions").update({ status: "not_started", completed_steps: [], completed_at: null, updated_at: new Date().toISOString() }).eq("id", sessionId).eq("test_mode", true).select("*").single();
  if (updateError) throw updateError;
  return data;
}

export async function deleteTestWeeklyBetaSession(sessionId: string) {
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("beta_test_sessions")
    .select("id,test_mode")
    .eq("id", sessionId)
    .eq("test_mode", true)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) throw new Error("Test session not found.");

  await supabaseAdmin
    .from("beta_feedback")
    .delete()
    .eq("beta_session_id", sessionId)
    .eq("test_mode", true);

  const { data: runs, error: runsError } = await supabaseAdmin
    .from("beta_search_runs")
    .select("id")
    .eq("beta_session_id", sessionId)
    .eq("test_mode", true);
  if (runsError) throw runsError;
  const runIds = (runs ?? []).map((run: any) => run.id);

  if (runIds.length) {
    await supabaseAdmin
      .from("beta_search_results")
      .delete()
      .in("beta_search_run_id", runIds)
      .eq("test_mode", true);
    await supabaseAdmin
      .from("beta_search_runs")
      .delete()
      .in("id", runIds)
      .eq("test_mode", true);
  }

  const { error } = await supabaseAdmin
    .from("beta_test_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("test_mode", true);
  if (error) throw error;
  return { deleted: true };
}
