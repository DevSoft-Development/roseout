import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import BetaAdminClient from "./BetaAdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beta Testing – Admin" };

const betaAdminRoles = ["superadmin", "admin", "experience_team"] as const;

function formatEmailStatus(status: unknown) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "sent") return "Sent";
  if (normalized === "failed" || normalized === "error") return "Failed";
  if (normalized === "skipped") return "Skipped";
  return "Not sent";
}

async function safe<T>(fn: () => Promise<T>, fallback: T) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function loadCustomPrompts() {
  const [{ data: assignments }, { data: logs }] = await Promise.all([
    getAdminDatabaseClient()
      .from("beta_task_assignments")
      .select("id,created_at,submitted_prompt,used_custom_prompt")
      .eq("used_custom_prompt", true)
      .order("created_at", { ascending: false })
      .limit(100),
    getAdminDatabaseClient()
      .from("search_performance_logs")
      .select("id,created_at,search_query,source,speed_status,total_ms")
      .eq("used_custom_prompt", true)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  return { assignments: assignments || [], logs: logs || [] };
}

async function loadWeeklySessions() {
  const { data: sessions } = await getAdminDatabaseClient()
    .from("beta_test_sessions")
    .select("*, beta_testers(name,email)")
    .order("week_start_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  const sessionRows = sessions || [];
  const ids = sessionRows.map((session: any) => session.id);
  const testerIds = [...new Set(sessionRows.map((session: any) => session.tester_id).filter(Boolean))];
  const weekStarts = [...new Set(sessionRows.map((session: any) => session.week_start_date).filter(Boolean))];

  const [runsResult, remindersResult] = await Promise.all([
    ids.length
      ? getAdminDatabaseClient()
          .from("beta_search_runs")
          .select("id,beta_session_id,outing_sentence,result_mode,updated_at")
          .in("beta_session_id", ids)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    testerIds.length && weekStarts.length
      ? getAdminDatabaseClient()
          .from("beta_email_reminders")
          .select("tester_id,week_start,status,created_at")
          .eq("reminder_type", "completed_weekly_goal")
          .in("tester_id", testerIds)
          .in("week_start", weekStarts)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const runs = runsResult.data || [];
  const runIds = runs.map((run: any) => run.id);
  const { data: selected } = runIds.length
    ? await getAdminDatabaseClient()
        .from("beta_search_results")
        .select("beta_search_run_id,result_title,result_type,updated_at")
        .in("beta_search_run_id", runIds)
        .or("was_selected.eq.true,was_saved.eq.true,was_top_pick.eq.true,was_chosen_action_result.eq.true")
        .order("updated_at", { ascending: false })
    : { data: [] as any[] };

  const runBySession = new Map<string, any>();
  for (const run of runs) if (!runBySession.has(run.beta_session_id)) runBySession.set(run.beta_session_id, run);

  const reminderByTesterWeek = new Map<string, any>();
  for (const reminder of remindersResult.data || []) {
    const key = `${reminder.tester_id}:${reminder.week_start}`;
    if (!reminderByTesterWeek.has(key)) reminderByTesterWeek.set(key, reminder);
  }

  const selectedByRun = new Map<string, any>();
  for (const result of selected || []) {
    if (!selectedByRun.has(result.beta_search_run_id)) selectedByRun.set(result.beta_search_run_id, result);
  }

  return sessionRows.map((session: any) => {
    const run = runBySession.get(session.id);
    const result = run ? selectedByRun.get(run.id) : null;
    return {
      id: session.id,
      tester: session.beta_testers?.name || session.beta_testers?.email || session.tester_id,
      week: session.week_number,
      mode: session.test_mode ? "Test mode" : "Real",
      status: session.status,
      steps_completed: Array.isArray(session.completed_steps) ? `${session.completed_steps.length}/5` : "0/5",
      outing_sentence: run?.outing_sentence || null,
      result_mode: run?.result_mode || null,
      selected_result: result?.result_title || null,
      last_activity: run?.updated_at || session.updated_at,
      email_status: session.test_mode
        ? "Skipped"
        : formatEmailStatus(reminderByTesterWeek.get(`${session.tester_id}:${session.week_start_date}`)?.status),
      test_mode: Boolean(session.test_mode),
    };
  });
}

async function loadTurnstile() {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count }, { data: logs }] = await Promise.all([
    getAdminDatabaseClient()
      .from("turnstile_verification_logs")
      .select("id", { count: "exact", head: true })
      .eq("success", false)
      .gte("created_at", since),
    getAdminDatabaseClient()
      .from("turnstile_verification_logs")
      .select("id,source,action,hostname,success,error_codes,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    status: {
      enabled: String(process.env.TURNSTILE_ENABLED ?? "true") !== "false",
      siteKeyConfigured: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
      secretKeyConfigured: Boolean(process.env.TURNSTILE_SECRET_KEY),
      failuresLast24h: count || 0,
      protectedForms: ["Beta application", "Anonymous feedback", "Anonymous bug report"],
    },
    logs: logs || [],
  };
}

export default async function Page() {
  await requireAdminRole(betaAdminRoles);

  const [
    overview,
    applications,
    testers,
    tasks,
    feedback,
    bugs,
    searchLogs,
    customPrompts,
    weeklySettings,
    weeklySessions,
    reminders,
    turnstile,
  ] = await Promise.all([
    safe(async () => {
      const { data } = await getAdminDatabaseClient().from("admin_beta_overview").select("*").maybeSingle();
      return data || {};
    }, {}),
    safe(async () => {
      const { data } = await getAdminDatabaseClient().from("beta_applications").select("*").order("created_at", { ascending: false }).limit(200);
      return data || [];
    }, []),
    safe(async () => {
      const { data } = await getAdminDatabaseClient().from("beta_testers").select("*").order("created_at", { ascending: false }).limit(200);
      return data || [];
    }, []),
    safe(async () => {
      const { data } = await getAdminDatabaseClient().from("beta_tasks").select("*").in("status", ["active", "draft"]).order("created_at", { ascending: false }).limit(200);
      return data || [];
    }, []),
    safe(async () => {
      const { data } = await getAdminDatabaseClient().from("beta_feedback").select("*").order("created_at", { ascending: false }).limit(200);
      return data || [];
    }, []),
    safe(async () => {
      const { data } = await getAdminDatabaseClient().from("beta_bug_reports").select("*").order("created_at", { ascending: false }).limit(200);
      return data || [];
    }, []),
    safe(async () => {
      const { data } = await getAdminDatabaseClient().from("search_performance_logs").select("*").order("created_at", { ascending: false }).limit(200);
      return data || [];
    }, []),
    safe(loadCustomPrompts, { assignments: [], logs: [] }),
    safe(async () => {
      const { data } = await getAdminDatabaseClient()
        .from("feature_flags")
        .select("key,enabled")
        .in("key", ["weekly_beta_enabled", "weekly_beta_e2e_test_mode_enabled"]);
      return Object.fromEntries((data || []).map((flag: any) => [flag.key, Boolean(flag.enabled)]));
    }, { weekly_beta_enabled: false, weekly_beta_e2e_test_mode_enabled: false }),
    safe(loadWeeklySessions, []),
    safe(async () => {
      const { data } = await getAdminDatabaseClient().from("beta_email_reminders").select("*").order("created_at", { ascending: false }).limit(200);
      return data || [];
    }, []),
    safe(loadTurnstile, { status: {} as any, logs: [] }),
  ]);

  return (
    <main className="admin-page min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,.18),transparent_30%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6">
          <p className="text-xs font-black uppercase tracking-[.32em] text-rose-200">Admin Tools</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Beta Testing</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
            Manage beta applications, testers, weekly tasks, feedback, bugs, custom prompts, reminders, Turnstile protection, and search speed diagnostics.
          </p>
        </section>
        <BetaAdminClient
          overview={overview}
          applications={applications}
          testers={testers}
          tasks={tasks}
          feedback={feedback}
          bugs={bugs}
          searchLogs={searchLogs}
          customPrompts={customPrompts}
          reminders={reminders}
          turnstile={turnstile}
          weeklySettings={weeklySettings}
          weeklySessions={weeklySessions}
        />
      </div>
    </main>
  );
}
