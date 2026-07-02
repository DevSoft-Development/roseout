import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentWeekStart } from "@/lib/beta/weeklyTasks";
import { sendBetaReminderEmail } from "@/lib/beta/reminderEmails";

const CANONICAL_WEEKLY_STEPS = [
  "write_outing",
  "review_results",
  "choose_match",
  "feedback",
  "check_in",
] as const;
const LEGACY_WEEKLY_STEP_ALIASES: Record<
  string,
  (typeof CANONICAL_WEEKLY_STEPS)[number]
> = {
  "1": "write_outing",
  "2": "review_results",
  "3": "choose_match",
  "4": "feedback",
  "5": "check_in",
  search_run: "review_results",
  selection: "choose_match",
  checkin: "check_in",
  "check-in": "check_in",
  complete: "check_in",
  final_check_in: "check_in",
};

function normalizeWeeklyCompletedSteps(completedSteps: unknown, session?: any) {
  const normalized = new Set<(typeof CANONICAL_WEEKLY_STEPS)[number]>();
  if (Array.isArray(completedSteps)) {
    completedSteps.forEach((step) => {
      const key = String(step).trim();
      const canonical = CANONICAL_WEEKLY_STEPS.includes(
        key as (typeof CANONICAL_WEEKLY_STEPS)[number],
      )
        ? (key as (typeof CANONICAL_WEEKLY_STEPS)[number])
        : LEGACY_WEEKLY_STEP_ALIASES[key];
      if (canonical) normalized.add(canonical);
    });
  }
  if (session?.status === "completed" || session?.completed_at) {
    CANONICAL_WEEKLY_STEPS.forEach((step) => normalized.add(step));
  }
  return CANONICAL_WEEKLY_STEPS.filter((step) => normalized.has(step));
}

export function cappedWeeklyCompletedSteps(
  completedSteps: unknown,
  required = 5,
) {
  return Math.min(
    required,
    normalizeWeeklyCompletedSteps(completedSteps).length,
  );
}

export function shouldSyncTesterProgress(session: any) {
  return Boolean(session?.tester_id && !session?.test_mode);
}

async function syncTesterProgressFromSession(session: any) {
  if (!shouldSyncTesterProgress(session)) return;
  await supabaseAdmin
    .from("beta_testers")
    .update({
      current_week_start: session.week_start_date,
      weekly_required_tests: 5,
      weekly_completed_tests: cappedWeeklyCompletedSteps(
        session.completed_steps,
        5,
      ),
      last_active_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.tester_id);
}

async function queueCompletedWeeklyGoalEmailOnce(
  previousSession: any,
  session: any,
) {
  if (
    session?.test_mode ||
    !session?.tester_id ||
    session.status !== "completed"
  )
    return;
  if (previousSession?.status === "completed" || previousSession?.completed_at)
    return;
  const weekStart = session.week_start_date || getCurrentWeekStart();
  const { data } = await supabaseAdmin
    .from("beta_email_reminders")
    .select("id")
    .eq("tester_id", session.tester_id)
    .eq("reminder_type", "completed_weekly_goal")
    .eq("week_start", weekStart)
    .in("status", ["pending", "sent"])
    .limit(1);
  if (data?.length) return;
  try {
    await sendBetaReminderEmail({
      testerId: session.tester_id,
      reminderType: "completed_weekly_goal",
      weekStart,
    });
  } catch (error) {
    console.error("WEEKLY_BETA_COMPLETION_EMAIL_ERROR", {
      testerId: session.tester_id,
      betaSessionId: session.id,
      weekStart,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function resolveBetaAssignmentId(
  value: unknown,
  sessionId?: string | null,
) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id || id === sessionId) return null;

  const { data, error } = await supabaseAdmin
    .from("beta_task_assignments")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id;
}

async function currentTester() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let tester: any = null;
  let isAdmin = false;
  if (user?.id || user?.email) {
    const or = [`user_id.eq.${user.id}`];
    if (user.email) or.push(`email.eq.${user.email}`);
    const { data } = await supabaseAdmin
      .from("beta_testers")
      .select("*")
      .or(or.join(","))
      .maybeSingle();
    tester = data;
    const { data: admin } = await supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    isAdmin = ["admin", "superadmin"].includes(String(admin?.role || ""));
  }
  return { user, tester, isAdmin };
}
function endOfWeek(start?: string) {
  if (!start) return null;
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}
function titleFor(item: any) {
  return (
    item?.title ||
    item?.pair_title ||
    item?.name ||
    item?.restaurant_name ||
    item?.activity_name ||
    item?.business_name ||
    "Beta result"
  );
}
export function completedStepsFor(action: string, existing?: unknown) {
  const current = normalizeWeeklyCompletedSteps(existing);
  const next =
    action === "feedback"
      ? CANONICAL_WEEKLY_STEPS
      : action === "selection"
        ? CANONICAL_WEEKLY_STEPS.slice(0, 3)
        : CANONICAL_WEEKLY_STEPS.slice(0, 2);
  return CANONICAL_WEEKLY_STEPS.filter((step) =>
    new Set([...current, ...next]).has(step),
  );
}
function ownsSession(session: any, user: any, tester: any, isAdmin: boolean) {
  return Boolean(
    (user?.id && session.user_id === user.id) ||
    (tester?.id && session.tester_id === tester.id) ||
    isAdmin,
  );
}
async function resolveSession({
  body,
  user,
  tester,
  isAdmin,
  week,
  testMode,
}: any) {
  const weekStart = body.week_start_date || getCurrentWeekStart();
  if (body.beta_session_id) {
    const { data, error } = await supabaseAdmin
      .from("beta_test_sessions")
      .select("*")
      .eq("id", body.beta_session_id)
      .maybeSingle();
    if (error) throw error;
    if (!data || !ownsSession(data, user, tester, isAdmin))
      throw new Error("Beta session not found.");
    if (body.test_mode === true && !data.test_mode)
      throw new Error("Beta session not found.");
    return data;
  }

  const basePayload = {
    user_id: user?.id ?? tester?.user_id ?? null,
    tester_id: tester?.id ?? null,
    week_number: week,
    week_start_date: weekStart,
    week_end_date: endOfWeek(weekStart),
    status: "not_started",
    completed_steps: [],
    test_mode: testMode,
  };

  if (testMode) {
    if (!user?.id) throw new Error("A user account is required for test mode.");
    const { data: existing, error } = await supabaseAdmin
      .from("beta_test_sessions")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start_date", weekStart)
      .eq("test_mode", true)
      .maybeSingle();
    if (error) throw error;
    if (existing) return existing;
    const { data, error: insertError } = await supabaseAdmin
      .from("beta_test_sessions")
      .insert({ ...basePayload, user_id: user.id })
      .select("*")
      .single();
    if (insertError) throw insertError;
    return data;
  }

  if (!tester?.id)
    throw new Error("Beta access is required to save weekly progress.");
  const { data: existing, error } = await supabaseAdmin
    .from("beta_test_sessions")
    .select("*")
    .eq("tester_id", tester.id)
    .eq("week_start_date", weekStart)
    .eq("test_mode", false)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;
  const { data, error: insertError } = await supabaseAdmin
    .from("beta_test_sessions")
    .insert({ ...basePayload, tester_id: tester.id })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return data;
}

export async function POST(req: NextRequest) {
  let body: any = {};
  let testMode = false;
  let user: any = null;
  let tester: any = null;
  let week = 1;
  let betaAssignmentId: string | null = null;
  try {
    body = await req.json().catch(() => ({}));
    const auth = await currentTester();
    user = auth.user;
    tester = auth.tester;
    if (!user && !tester)
      return NextResponse.json(
        { error: "Beta access is required." },
        { status: 401 },
      );
    week = Math.min(4, Math.max(1, Number(body.week_number || 1)));
    testMode = Boolean(body.test_mode);
    const resolved = await resolveSession({
      body,
      user,
      tester,
      isAdmin: auth.isAdmin,
      week,
      testMode,
    });
    const action = String(body.action || "");
    const completedSteps = completedStepsFor(action, resolved.completed_steps);
    const alreadyCompleted =
      resolved.status === "completed" || Boolean(resolved.completed_at);
    const completing = action === "feedback" || alreadyCompleted;
    const update = await supabaseAdmin
      .from("beta_test_sessions")
      .update({
        status: completing ? "completed" : "in_progress",
        completed_steps: completing
          ? [...CANONICAL_WEEKLY_STEPS]
          : completedSteps,
        completed_at: completing
          ? resolved.completed_at || new Date().toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", resolved.id)
      .eq("test_mode", Boolean(resolved.test_mode))
      .select("*")
      .single();
    if (update.error) throw update.error;
    const session = update.data;
    await syncTesterProgressFromSession(session);
    await queueCompletedWeeklyGoalEmailOnce(resolved, session);

    if (body.action === "search_run") {
      betaAssignmentId = await resolveBetaAssignmentId(
        body.beta_assignment_id,
        session.id,
      );
      const run = await supabaseAdmin
        .from("beta_search_runs")
        .insert({
          beta_session_id: session.id,
          user_id: user?.id ?? tester?.user_id ?? null,
          tester_id: tester?.id ?? null,
          beta_assignment_id: betaAssignmentId,
          week_number: week,
          outing_sentence: String(body.outing_sentence || ""),
          enterprise_search_query_used:
            body.enterprise_search_query_used || null,
          result_mode:
            body.result_mode === "paired_outing"
              ? "paired_outing"
              : "single_location",
          pair_requested: Boolean(body.pair_requested),
          refinement_choices: Array.isArray(body.refinement_choices)
            ? body.refinement_choices
            : [],
          refinement_text: body.refinement_text || null,
          updated_enterprise_search_query:
            body.result_set === "updated"
              ? body.enterprise_search_query_used || null
              : null,
          test_mode: testMode,
        })
        .select("*")
        .single();
      if (run.error) throw run.error;
      const rows = [
        ...(body.results || []).map((r: any, i: number) => ({
          beta_search_run_id: run.data.id,
          result_type: "single_location",
          result_position: i + 1,
          result_title: titleFor(r),
          result_data: r,
          result_set: body.result_set || "original",
          test_mode: testMode,
        })),
        ...(body.pairs || []).map((p: any, i: number) => ({
          beta_search_run_id: run.data.id,
          result_type: "paired_outing",
          pair_id: p.id || p.pair_id || null,
          result_position: i + 1,
          result_title: titleFor(p),
          result_data: p,
          result_set: body.result_set || "original",
          test_mode: testMode,
        })),
      ];
      if (rows.length)
        await supabaseAdmin.from("beta_search_results").insert(rows);
      return NextResponse.json({ success: true, session, run: run.data });
    }
    if (body.action === "selection") {
      if (body.result_type !== "none" && !body.beta_search_run_id) {
        return NextResponse.json(
          { error: "Missing beta search run for selection." },
          { status: 400 },
        );
      }

      let selection = null;

      if (body.beta_search_run_id) {
        const { data, error } = await supabaseAdmin
          .from("beta_search_results")
          .insert({
            beta_search_run_id: body.beta_search_run_id,
            result_type: body.result_type || body.chosen_result_type || "none",
            result_title: titleFor(body.result),
            result_data: body.result || {},
            was_selected: Boolean(body.was_selected || body.selected_none),
            was_saved: Boolean(body.was_saved),
            was_top_pick: Boolean(body.was_top_pick),
            was_chosen_action_result: Boolean(body.was_chosen_action_result),
            test_mode: testMode,
          })
          .select("*")
          .single();

        if (error) throw error;
        selection = data;
      }

      return NextResponse.json({ success: true, session, selection });
    }
    if (body.action === "feedback") {
      const entries = Object.entries(body.feedback || {});
      const rows = entries.map(([key, value]) => ({
        tester_id: tester?.id ?? null,
        user_id: user?.id ?? null,
        beta_session_id: session.id,
        beta_search_run_id: body.beta_search_run_id || null,
        week_number: week,
        feedback_type: "general",
        feature_area: "guided_beta",
        message: `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
        question_key: key,
        question_text: key,
        answer_value: value == null ? null : value,
        answer_text: typeof value === "string" ? value : null,
        result_mode: body.result_mode || null,
        selected_none: Boolean(body.selected_none),
        search_query: body.outing_sentence || null,
        test_mode: testMode,
      }));
      if (rows.length) await supabaseAdmin.from("beta_feedback").insert(rows);
      return NextResponse.json({ success: true, session });
    }
    return NextResponse.json({ success: true, session });
  } catch (error) {
    console.error("GUIDED_BETA_SAVE_ERROR", {
      action: body.action || null,
      testMode: Boolean(body.test_mode),
      betaSessionId: body.beta_session_id || null,
      hasUser: Boolean(user?.id),
      hasTester: Boolean(tester?.id),
      week: body.week_number || null,
      weekStart: body.week_start_date || null,
      betaAssignmentId,
      isLikelySessionIdMisusedAsAssignmentId: Boolean(
        body.beta_assignment_id &&
        body.beta_assignment_id === body.beta_session_id,
      ),
      supabaseCode:
        typeof error === "object" && error && "code" in error
          ? (error as any).code
          : null,
      supabaseDetails:
        typeof error === "object" && error && "details" in error
          ? (error as any).details
          : null,
      supabaseHint:
        typeof error === "object" && error && "hint" in error
          ? (error as any).hint
          : null,
      supabaseMessage:
        typeof error === "object" && error && "message" in error
          ? (error as any).message
          : null,
      errorName: error instanceof Error ? error.name : null,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "We could not save beta progress." },
      { status: 500 },
    );
  }
}
