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

async function ensureDefaultTasks() {
  const defaults = [
    {
      title: "Search quality test",
      feature_area: "search_quality",
      tester_type: "user",
      priority: "high",
      test_url: "/create?betaTask=search-quality",
      prompt_mode: "either",
      predefined_prompt: "steak dinner with bowling in Astoria",
      allow_custom_prompt: true,
      custom_prompt_required: false,
      button_label: "Test Search Quality",
      estimated_minutes: 5,
      instructions:
        "Search for “steak dinner with bowling in Astoria,” or use your own similar outing prompt. Confirm that results show the right restaurants and activity options near the requested area. Report unrelated results, wrong categories, missing activity results, or anything confusing.",
    },
    {
      title: "Test group night search",
      description:
        "Check if TheOutHaven understands a group social outing search.",
      feature_area: "search_quality",
      tester_type: "user",
      priority: "high",
      test_url: "/create?prompt=group%20dinner%20and%20drinks",
      prompt_mode: "either",
      predefined_prompt: "group dinner and drinks",
      allow_custom_prompt: true,
      custom_prompt_required: false,
      button_label: "Test group dinner and drinks",
      estimated_minutes: 5,
      instructions:
        "Confirm the results match a group dinner or social outing. Results should not be mostly theaters unless the prompt clearly asks for entertainment. Report mismatched categories.",
    },
    {
      title: "Search speed test",
      feature_area: "search_speed",
      tester_type: "user",
      priority: "high",
      test_url: "/create?betaTask=search-speed",
      prompt_mode: "either",
      predefined_prompt: "casual dinner and relaxed activity",
      allow_custom_prompt: true,
      custom_prompt_required: false,
      button_label: "Test Search Speed",
      estimated_minutes: 5,
      instructions:
        "Search for “casual dinner and relaxed activity,” or enter your own prompt. Check if results load quickly, if the page freezes, or if an error appears. Submit feedback if the search feels slow.",
    },
    {
      title: "Try your own search prompt",
      feature_area: "natural_search",
      tester_type: "user",
      priority: "high",
      test_url: "/create?betaTask=custom-prompt",
      prompt_mode: "custom",
      predefined_prompt: null,
      allow_custom_prompt: true,
      custom_prompt_required: true,
      button_label: "Test My Prompt",
      estimated_minutes: 5,
      instructions:
        "Type a real search you would naturally use on TheOutHaven. After the search, tell us if the results were accurate and fast.",
    },
    {
      title: "Location page and photo test",
      feature_area: "location_page",
      tester_type: "user",
      priority: "medium",
      test_url: "/locations?betaTask=location-photo-test",
      prompt_mode: "predefined",
      allow_custom_prompt: false,
      button_label: "Test Location Pages",
      estimated_minutes: 5,
      instructions:
        "Open 2–3 location pages. Check that photos show correctly, addresses are not duplicated, categories look clean, and the page feels premium.",
    },
    {
      title: "Create plan flow test",
      feature_area: "create_flow",
      tester_type: "user",
      priority: "medium",
      test_url: "/create?betaTask=create-flow",
      prompt_mode: "either",
      predefined_prompt: "birthday dinner and fun activity in Queens",
      allow_custom_prompt: true,
      custom_prompt_required: false,
      button_label: "Test Plan Creation",
      estimated_minutes: 5,
      instructions:
        "Use the create flow to build a plan. You may use the provided prompt or your own. Check if the steps are easy to understand, if recommendations make sense, and if the page feels smooth.",
    },
    {
      title: "Rotating feature test",
      feature_area: "general",
      tester_type: "user",
      priority: "medium",
      test_url: "/beta/dashboard?betaTask=rotating-feature",
      prompt_mode: "predefined",
      allow_custom_prompt: false,
      button_label: "Start Weekly Feature Test",
      estimated_minutes: 5,
      instructions:
        "Complete the feature-specific test assigned to your tester type.",
    },
  ];
  for (const task of defaults) {
    const { data } = await supabaseAdmin
      .from("beta_tasks")
      .select("id")
      .eq("title", task.title)
      .maybeSingle();
    if (data)
      await supabaseAdmin
        .from("beta_tasks")
        .update({
          ...task,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
    else
      await supabaseAdmin
        .from("beta_tasks")
        .insert({ ...task, status: "active" });
  }
}

export async function assignWeeklyBetaTasksForTester(testerId: string) {
  await ensureDefaultTasks();
  const weekStart = getCurrentWeekStart();
  const { data: tester } = await supabaseAdmin
    .from("beta_testers")
    .select("*")
    .eq("id", testerId)
    .maybeSingle();
  if (!tester) return { assigned: 0, weekStart };
  const { data: existing } = await supabaseAdmin
    .from("beta_task_assignments")
    .select("id,status")
    .eq("tester_id", testerId)
    .eq("assigned_week_start", weekStart);
  if ((existing?.length ?? 0) >= 5) return { assigned: 0, weekStart };
  const { data: tasks } = await supabaseAdmin
    .from("beta_tasks")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(20);
  const availableTasks = (tasks ?? []) as BetaTaskRow[];
  const selected = availableTasks.slice(0, 5);
  while (selected.length < 5 && availableTasks.length)
    selected.push(availableTasks[selected.length % availableTasks.length]);
  const links = getDefaultBetaTaskLinks(tester.tester_type as BetaTesterType);
  const rows = selected
    .slice(0, 5 - (existing?.length ?? 0))
    .map((task, index: number) => ({
      task_id: task.id,
      tester_id: testerId,
      status: "assigned",
      assigned_week_start: weekStart,
      counts_toward_weekly_goal: true,
      test_url:
        task.title === "Rotating feature test"
          ? links[index % links.length]
          : task.test_url,
      assigned_prompt: task.predefined_prompt ?? null,
      prompt_mode: task.prompt_mode ?? "predefined",
      used_custom_prompt: false,
    }));
  if (rows.length)
    await supabaseAdmin
      .from("beta_task_assignments")
      .upsert(rows, { onConflict: "task_id,tester_id,assigned_week_start" });
  const completed = ((existing ?? []) as { status?: string }[]).filter(
    (assignment) => assignment.status === "completed",
  ).length;
  await supabaseAdmin
    .from("beta_testers")
    .update({
      current_week_start: weekStart,
      weekly_completed_tests: completed,
      weekly_required_tests: 5,
    })
    .eq("id", testerId);
  return { assigned: rows.length, weekStart };
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
