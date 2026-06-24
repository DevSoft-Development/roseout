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
    status,
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
