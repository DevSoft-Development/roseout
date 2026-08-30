import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError, unauthorized } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logCronJobRun } from "../_shared/cronLogger.ts";

const JOB_NAME = "admin-marketing-report-scheduler";

function siteUrl() {
  return (Deno.env.get("NEXT_PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://theouthaven.com").replace(/\/$/, "");
}

function cronSecretMatches(req: Request) {
  const expected = Deno.env.get("CRON_SECRET");
  return Boolean(expected) && req.headers.get("x-cron-secret") === expected;
}

Deno.serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  if (!cronSecretMatches(req)) return unauthorized("Invalid scheduler credentials.");

  const startedAt = new Date();
  const supabase = createSupabaseAdminClient();

  try {
    const nowIso = new Date().toISOString();
    const { count: dueCount, error: dueError } = await supabase
      .from("marketing_report_schedules")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .lte("next_run_at", nowIso);
    if (dueError) throw dueError;

    if (!dueCount) {
      const finishedAt = new Date();
      await logCronJobRun(supabase, {
        job_name: JOB_NAME,
        function_name: JOB_NAME,
        schedule_hint: "Every 15 minutes; sends only reports whose saved schedule is due",
        description: "Runs saved Marketing Intelligence report schedules and emails fresh report data.",
        source: "cron",
        status: "success",
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        checked_count: 0,
        success_count: 0,
        failed_count: 0,
        metadata: { processed: 0, skipped: true, reason: "no_due_schedules" },
      });
      return ok({ success: true, processed: 0, results: [], skipped: true, reason: "no_due_schedules" });
    }

    const workerSecret = Deno.env.get("WORKER_INTERNAL_SECRET") || "";
    if (!workerSecret) throw new Error("WORKER_INTERNAL_SECRET is not configured.");

    const response = await fetch(`${siteUrl()}/api/cron/marketing-report-scheduler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": workerSecret,
      },
      body: JSON.stringify({ source: "edge_function" }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) {
      throw new Error(payload?.error || `Marketing report dispatcher returned ${response.status}.`);
    }

    const finishedAt = new Date();
    await logCronJobRun(supabase, {
      job_name: JOB_NAME,
      function_name: JOB_NAME,
      schedule_hint: "Every 15 minutes; sends only reports whose saved schedule is due",
      description: "Runs saved Marketing Intelligence report schedules and emails fresh report data.",
      source: "cron",
      status: "success",
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      checked_count: Number(payload?.processed || 0),
      success_count: Array.isArray(payload?.results) ? payload.results.filter((item: any) => item?.sent).length : 0,
      failed_count: Array.isArray(payload?.results) ? payload.results.filter((item: any) => !item?.sent).length : 0,
      metadata: { processed: Number(payload?.processed || 0) },
    });

    return ok({ success: true, processed: Number(payload?.processed || 0), results: payload?.results || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();
    await logCronJobRun(supabase, {
      job_name: JOB_NAME,
      function_name: JOB_NAME,
      schedule_hint: "Every 15 minutes; sends only reports whose saved schedule is due",
      description: "Runs saved Marketing Intelligence report schedules and emails fresh report data.",
      source: "cron",
      status: "failed",
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      failed_count: 1,
      error_message: message,
    }).catch(() => undefined);
    return serverError("Marketing report scheduler failed.", { message });
  }
});