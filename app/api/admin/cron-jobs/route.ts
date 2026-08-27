import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { cronDefinition, cronDefinitions, humanizeCronKey, vercelCronSchedules } from "@/lib/cron/controlPlane";
import { summarizeCronOutcome } from "@/lib/cron/outcome";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type RunRow = {
  job_key: string | null;
  job_name?: string | null;
  function_name?: string | null;
  status: string | null;
  created_at: string | null;
  completed_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  error_message?: string | null;
  checked_count?: number | null;
  success_count?: number | null;
  skipped_count?: number | null;
  failed_count?: number | null;
  details?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

type PgCronRow = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  command_kind: "http" | "sql" | string;
  last_status: string | null;
  last_start_time: string | null;
  last_end_time: string | null;
  last_return_message: string | null;
};

type RunStats = {
  count: number;
  latest?: RunRow;
  recent: RunRow[];
  consecutiveFailures: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  recoveredAt: string | null;
  slowThresholdMs: number | null;
  consecutiveSlowSuccesses: number;
};

function operationalStatus(value: string | null | undefined): "running" | "success" | "failed" | "never_run" {
  const normalized = String(value || "never_run").toLowerCase();
  if (["failed", "error", "failure"].includes(normalized)) return "failed";
  if (["running", "started", "starting"].includes(normalized)) return "running";
  if (["success", "succeeded", "warning", "skipped"].includes(normalized)) return "success";
  return "never_run";
}

function categoryFor(job: any) {
  const key = String(job.job_key || "");
  if (key.startsWith("reservation-")) return "reservation";
  if (key.includes("marketing")) return "marketing";
  if (key.includes("search")) return "search";
  if (key.includes("billing") || key.includes("stripe")) return "payments";
  if (key.includes("website") || key.includes("domain")) return "hosting";
  if (key.includes("crm")) return "crm";
  if (key === "admin-cron-digest-email" || key === "cron-alert-dispatcher") return "monitoring";
  return "operations";
}

function latestRunTime(run?: RunRow) {
  return run?.completed_at || run?.finished_at || run?.created_at || null;
}

function isFailedRun(run?: RunRow) {
  return operationalStatus(run?.status) === "failed" || Boolean(run?.error_message);
}

function isSuccessfulRun(run?: RunRow) {
  return operationalStatus(run?.status) === "success" && !run?.error_message;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function buildRunStats(recent: RunRow[], count: number): RunStats {
  const latest = recent[0];
  let consecutiveFailures = 0;
  for (const run of recent) {
    if (!isFailedRun(run)) break;
    consecutiveFailures += 1;
  }

  const lastFailure = recent.find(isFailedRun);
  const lastSuccess = recent.find(isSuccessfulRun);
  const latestTime = Date.parse(latestRunTime(latest) || "") || 0;
  const failureTime = Date.parse(latestRunTime(lastFailure) || "") || 0;
  const successTime = Date.parse(latestRunTime(lastSuccess) || "") || 0;
  const recoveredAt = successTime > failureTime && failureTime > 0 ? latestRunTime(lastSuccess) : null;

  const baselineDurations = recent
    .slice(1, 11)
    .filter(isSuccessfulRun)
    .map((run) => Number(run.duration_ms || 0))
    .filter((duration) => duration > 0);
  const baselineMedian = median(baselineDurations);
  const slowThresholdMs = baselineMedian != null ? Math.max(10_000, baselineMedian * 3) : null;

  let consecutiveSlowSuccesses = 0;
  if (slowThresholdMs != null) {
    for (const run of recent) {
      if (!isSuccessfulRun(run)) break;
      const duration = Number(run.duration_ms || 0);
      if (duration < slowThresholdMs) break;
      consecutiveSlowSuccesses += 1;
    }
  }

  return {
    count,
    latest,
    recent,
    consecutiveFailures,
    lastFailureAt: failureTime ? latestRunTime(lastFailure) : null,
    lastSuccessAt: successTime ? latestRunTime(lastSuccess) : null,
    recoveredAt: latestTime === successTime ? recoveredAt : null,
    slowThresholdMs,
    consecutiveSlowSuccesses,
  };
}

function attentionReason(args: {
  job: any;
  runStats: RunStats;
  scheduler: PgCronRow | null;
  scheduleDetected: boolean;
  loggerExpected: boolean;
}) {
  const { job, runStats, scheduler, scheduleDetected, loggerExpected } = args;
  if (job.is_active === false || scheduler?.active === false) return "paused";
  if (!scheduleDetected) return "schedule_missing";
  if (operationalStatus(scheduler?.last_status) === "failed") return "scheduler_failed";

  if (isFailedRun(runStats.latest)) {
    const latestFailureAt = Date.parse(latestRunTime(runStats.latest) || "") || 0;
    const failureAgeMs = latestFailureAt ? Date.now() - latestFailureAt : Number.POSITIVE_INFINITY;
    if (runStats.consecutiveFailures >= 2 || failureAgeMs >= 5 * 60_000) return "persistent_run_failure";
    return "recovering_from_transient_failure";
  }

  if (runStats.consecutiveSlowSuccesses >= 2) return "repeated_slow_runs";

  if (scheduler?.last_start_time && loggerExpected) {
    const schedulerStarted = Date.parse(scheduler.last_start_time);
    const appLogged = Date.parse(latestRunTime(runStats.latest) || "") || 0;
    if (schedulerStarted && schedulerStarted - appLogged > 120_000) return "scheduler_succeeded_without_app_log";
  }

  if (loggerExpected && !runStats.count) return "ok";
  return "ok";
}

export async function GET() {
  const auth = await requireAdminApiRole(["admin", "superadmin"]);
  if (auth.error) return auth.error;

  const [{ data: cronJobs, error }, { data: runs, error: runsError }, { data: pgSnapshot, error: pgError }] = await Promise.all([
    supabaseAdmin.from("cron_jobs").select("*"),
    supabaseAdmin
      .from("cron_job_runs")
      .select("job_key,job_name,function_name,status,created_at,completed_at,finished_at,duration_ms,error_message,checked_count,success_count,skipped_count,failed_count,details,metadata")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin.rpc("admin_get_pg_cron_snapshot"),
  ]);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  if (runsError) return NextResponse.json({ success: false, error: runsError.message }, { status: 400 });
  if (pgError) return NextResponse.json({ success: false, error: pgError.message }, { status: 400 });

  const existing = new Map((cronJobs || []).map((job: any) => [String(job.job_key), job]));
  const pgByKey = new Map(((pgSnapshot || []) as PgCronRow[]).map((job) => [job.jobname, job]));
  const vercelByKey = vercelCronSchedules();
  const allKeys = new Set<string>([
    ...existing.keys(),
    ...pgByKey.keys(),
    ...vercelByKey.keys(),
    ...cronDefinitions().map((definition) => definition.jobKey),
  ]);

  const missing = Array.from(allKeys)
    .filter((jobKey) => !existing.has(jobKey))
    .map((jobKey) => {
      const definition = cronDefinition(jobKey);
      const pg = pgByKey.get(jobKey);
      const vercel = vercelByKey.get(jobKey);
      return {
        job_key: jobKey,
        job_name: definition?.jobName || humanizeCronKey(jobKey),
        route_path: definition?.targetPath || null,
        source: pg ? "pg_cron" : vercel ? "vercel_cron" : "registered",
        schedule_hint: pg ? `pg_cron: ${pg.schedule}` : vercel ? `Vercel cron: ${vercel.schedule}` : null,
        is_active: pg?.active ?? true,
        is_manually_runnable: definition?.manuallyRunnable ?? false,
      };
    });

  if (missing.length) {
    const { data: inserted, error: insertError } = await supabaseAdmin.from("cron_jobs").insert(missing).select("*");
    if (insertError) return NextResponse.json({ success: false, error: insertError.message }, { status: 400 });
    for (const row of inserted || []) existing.set(String(row.job_key), row);
  }

  const runGroups = new Map<string, RunRow[]>();
  const runCounts = new Map<string, number>();
  for (const run of (runs || []) as RunRow[]) {
    if (!run.job_key) continue;
    runCounts.set(run.job_key, (runCounts.get(run.job_key) || 0) + 1);
    const group = runGroups.get(run.job_key) || [];
    if (group.length < 12) group.push(run);
    runGroups.set(run.job_key, group);
  }

  const stats = new Map<string, RunStats>();
  for (const jobKey of allKeys) {
    stats.set(jobKey, buildRunStats(runGroups.get(jobKey) || [], runCounts.get(jobKey) || 0));
  }

  const jobs = Array.from(allKeys).map((jobKey) => {
    const job = existing.get(jobKey) || { job_key: jobKey, job_name: humanizeCronKey(jobKey) };
    const definition = cronDefinition(jobKey);
    const scheduler = pgByKey.get(jobKey) || null;
    const vercelSchedule = vercelByKey.get(jobKey) || null;
    const runStats = stats.get(jobKey) || buildRunStats([], 0);
    const scheduleDetected = Boolean(scheduler || vercelSchedule);
    const loggerExpected = scheduler ? scheduler.command_kind === "http" : Boolean(vercelSchedule || definition);
    const needs_attention_reason = attentionReason({ job, runStats, scheduler, scheduleDetected, loggerExpected });
    const appStatus = operationalStatus(runStats.latest?.status || job.last_status);
    const schedulerStatus = operationalStatus(scheduler?.last_status);
    const effectiveStatus = loggerExpected ? appStatus : schedulerStatus;
    const displayStatus = effectiveStatus === "never_run" ? "scheduled" : effectiveStatus;
    const outcomeSource = runStats.latest || {
      job_key: jobKey,
      job_name: job.job_name,
      status: job.last_status,
      details: job.last_details || {},
    };
    const healthState = needs_attention_reason === "recovering_from_transient_failure"
      ? "recovering"
      : runStats.recoveredAt
        ? "recovered"
        : needs_attention_reason === "repeated_slow_runs"
          ? "slow"
          : displayStatus;

    return {
      ...job,
      job_name: job.job_name || definition?.jobName || humanizeCronKey(jobKey),
      route_path: definition?.targetPath || job.route_path || null,
      source: scheduler ? "pg_cron" : vercelSchedule ? "vercel_cron" : job.source || "registered",
      schedule_hint: scheduler
        ? `pg_cron: ${scheduler.schedule}`
        : vercelSchedule
          ? `Vercel cron: ${vercelSchedule.schedule}`
          : job.schedule_hint || null,
      schedule_detected: scheduleDetected,
      logger_expected: loggerExpected,
      is_active: scheduler ? scheduler.active && job.is_active !== false : job.is_active !== false,
      is_manually_runnable: definition?.manuallyRunnable ?? Boolean(job.is_manually_runnable),
      last_status: displayStatus,
      health_state: healthState,
      has_run_history: runStats.count > 0,
      run_count: runStats.count,
      latest_run_at: latestRunTime(runStats.latest),
      latest_run_status: runStats.latest?.status || null,
      latest_outcome: summarizeCronOutcome(outcomeSource),
      scheduler_status: scheduler?.last_status || null,
      scheduler_last_started_at: scheduler?.last_start_time || null,
      scheduler_last_completed_at: scheduler?.last_end_time || null,
      scheduler_return_message: scheduler?.last_return_message || null,
      needs_attention_reason,
      consecutive_failures: runStats.consecutiveFailures,
      recovered_at: runStats.recoveredAt,
      last_failure_at: runStats.lastFailureAt,
      last_success_at: runStats.lastSuccessAt,
      slow_threshold_ms: runStats.slowThresholdMs,
      consecutive_slow_successes: runStats.consecutiveSlowSuccesses,
      category: categoryFor(job),
    };
  });

  const statusRank: Record<string, number> = { failed: 0, running: 1, scheduled: 2, success: 3 };
  jobs.sort((a: any, b: any) => {
    const aAttention = ["ok", "paused", "recovering_from_transient_failure"].includes(a.needs_attention_reason) ? 1 : 0;
    const bAttention = ["ok", "paused", "recovering_from_transient_failure"].includes(b.needs_attention_reason) ? 1 : 0;
    const attentionDelta = aAttention - bAttention;
    if (attentionDelta) return attentionDelta;
    const statusDelta = (statusRank[a.last_status] ?? 4) - (statusRank[b.last_status] ?? 4);
    if (statusDelta) return statusDelta;
    return String(a.job_name).localeCompare(String(b.job_name));
  });

  const counts = {
    total: jobs.length,
    success: jobs.filter((j: any) => j.last_status === "success").length,
    failed: jobs.filter((j: any) => j.last_status === "failed").length,
    running: jobs.filter((j: any) => j.last_status === "running").length,
    never_run: jobs.filter((j: any) => j.last_status === "scheduled").length,
    scheduled: jobs.filter((j: any) => j.last_status === "scheduled").length,
    active_count: jobs.filter((j: any) => j.is_active !== false).length,
    paused_count: jobs.filter((j: any) => j.is_active === false).length,
    needs_attention: jobs.filter((j: any) => !["ok", "paused", "recovering_from_transient_failure"].includes(j.needs_attention_reason)).length,
    recovering: jobs.filter((j: any) => j.health_state === "recovering").length,
    recovered: jobs.filter((j: any) => j.health_state === "recovered").length,
    slow: jobs.filter((j: any) => j.health_state === "slow").length,
    email_alerts_enabled: jobs.filter((j: any) => j.send_success_email || j.send_failure_email).length,
    pg_cron_count: pgByKey.size,
    vercel_cron_count: vercelByKey.size,
  };

  return NextResponse.json({ success: true, jobs, counts });
}
