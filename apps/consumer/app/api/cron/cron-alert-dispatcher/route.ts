import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { sendCronImportSummaryEmail } from "@/lib/admin/nightlyImportEmail";
import { humanizeCronKey } from "@/lib/cron/controlPlane";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function configuredRecipients(job: any) {
  return Array.isArray(job?.email_recipients) && job.email_recipients.length ? job.email_recipients.map(String) : undefined;
}

function schedulerFailed(status: unknown) {
  return ["failed", "error", "failure"].includes(String(status || "").toLowerCase());
}

function runTime(run: any) {
  return Date.parse(run?.created_at || run?.started_at || run?.finished_at || "") || 0;
}

function failureAlertDecision(run: any, allRuns: any[]) {
  if (!schedulerFailed(run.status) && !run.error_message) return "send" as const;

  const currentTime = runTime(run);
  const laterRuns = allRuns
    .filter((candidate) => candidate.job_key === run.job_key && runTime(candidate) > currentTime)
    .sort((a, b) => runTime(a) - runTime(b));

  if (laterRuns.some((candidate) => !schedulerFailed(candidate.status) && !candidate.error_message)) {
    return "recovered" as const;
  }

  if (laterRuns.some((candidate) => schedulerFailed(candidate.status) || candidate.error_message)) {
    return "send" as const;
  }

  const ageMs = currentTime ? Date.now() - currentTime : Number.POSITIVE_INFINITY;
  return ageMs >= 5 * 60_000 ? "send" as const : "defer" as const;
}

async function markRecoveredTransient(run: any) {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("cron_job_runs")
    .update({
      alert_dispatched_at: now,
      details: {
        ...(run.details || {}),
        alert_resolution: {
          disposition: "recovered_without_alert",
          resolved_at: now,
          reason: "A later successful run recovered before the alert threshold was reached.",
        },
      },
    })
    .eq("id", run.id);
}

async function syncPgCronOutcomes() {
  const { data: snapshot, error: snapshotError } = await supabaseAdmin.rpc("admin_get_pg_cron_snapshot");
  if (snapshotError) throw new Error(snapshotError.message);

  const schedulerJobs = snapshot || [];
  const schedulerKeys = schedulerJobs.map((job: any) => job.jobname).filter(Boolean);
  const { data: registered, error: registeredError } = schedulerKeys.length
    ? await supabaseAdmin.from("cron_jobs").select("job_key").in("job_key", schedulerKeys)
    : { data: [], error: null } as any;
  if (registeredError) throw new Error(registeredError.message);

  const existingKeys = new Set((registered || []).map((row: any) => row.job_key));
  const missing = schedulerJobs
    .filter((job: any) => !existingKeys.has(job.jobname))
    .map((job: any) => ({
      job_key: job.jobname,
      job_name: humanizeCronKey(job.jobname),
      source: "pg_cron",
      schedule_hint: `pg_cron: ${job.schedule}`,
      is_active: job.active,
    }));
  if (missing.length) {
    const { error } = await supabaseAdmin.from("cron_jobs").insert(missing);
    if (error) throw new Error(error.message);
  }

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: existingSchedulerRuns, error: runsError } = await supabaseAdmin
    .from("cron_job_runs")
    .select("job_key,details")
    .eq("source", "pg_cron_scheduler")
    .gte("created_at", since)
    .limit(1000);
  if (runsError) throw new Error(runsError.message);

  const seen = new Set(
    (existingSchedulerRuns || []).map((run: any) => `${run.job_key}:${String(run.details?.scheduler_started_at || "")}`),
  );
  const synthetic: Record<string, unknown>[] = [];

  for (const scheduler of schedulerJobs) {
    if (!scheduler.last_start_time) continue;
    const failed = schedulerFailed(scheduler.last_status);
    if (scheduler.command_kind !== "sql" && !failed) continue;
    const fingerprint = `${scheduler.jobname}:${scheduler.last_start_time}`;
    if (seen.has(fingerprint)) continue;

    const started = Date.parse(scheduler.last_start_time) || Date.now();
    const finished = Date.parse(scheduler.last_end_time || "") || started;
    synthetic.push({
      job_key: scheduler.jobname,
      job_name: humanizeCronKey(scheduler.jobname),
      source: "pg_cron_scheduler",
      status: failed ? "failed" : "success",
      started_at: scheduler.last_start_time,
      completed_at: scheduler.last_end_time || scheduler.last_start_time,
      finished_at: scheduler.last_end_time || scheduler.last_start_time,
      duration_ms: Math.max(0, finished - started),
      message: failed
        ? `${scheduler.jobname} scheduler invocation failed.`
        : `${scheduler.jobname} scheduler invocation succeeded.`,
      error_message: failed ? scheduler.last_return_message || "pg_cron scheduler failure" : null,
      details: {
        scheduler: "pg_cron",
        scheduler_job_id: scheduler.jobid,
        scheduler_started_at: scheduler.last_start_time,
        scheduler_status: scheduler.last_status,
        scheduler_return_message: scheduler.last_return_message,
      },
    });
  }

  if (synthetic.length) {
    const { error } = await supabaseAdmin.from("cron_job_runs").insert(synthetic);
    if (error) throw new Error(error.message);
  }

  return { schedulerJobs: schedulerJobs.length, synthesized: synthetic.length };
}

async function dispatch(job: any, run: any) {
  const failed = schedulerFailed(run.status) || Boolean(run.error_message);
  const enabled = failed ? Boolean(job.send_failure_email) : Boolean(job.send_success_email);
  if (!enabled) return { attempted: false, sent: false };

  const original = process.env.ADMIN_ALERT_EMAIL;
  const recipients = configuredRecipients(job);
  if (recipients?.length) process.env.ADMIN_ALERT_EMAIL = recipients.join(",");

  try {
    const startedAt = run.started_at || run.created_at || new Date().toISOString();
    const finishedAt = run.completed_at || run.finished_at || run.created_at || new Date().toISOString();
    const message = run.error_message || run.message || `${job.job_name || job.job_key} ${run.status}.`;
    const delivery = await sendCronImportSummaryEmail({
      success: !failed,
      cronName: job.job_name || job.job_key,
      startedAt,
      finishedAt,
      durationMs: Number(run.duration_ms || 0),
      steps: [
        {
          path: job.route_path || job.job_key,
          ok: !failed,
          status: failed ? 500 : 200,
          label: job.job_name || job.job_key,
          data: { ...(run.details || {}), message, error: run.error_message || null },
        },
      ],
    });
    if (delivery.sent) {
      await supabaseAdmin.from("cron_job_runs").update({ alert_dispatched_at: new Date().toISOString() }).eq("id", run.id);
    }
    return { attempted: true, sent: delivery.sent, error: delivery.error || null };
  } finally {
    if (recipients?.length) {
      if (original === undefined) delete process.env.ADMIN_ALERT_EMAIL;
      else process.env.ADMIN_ALERT_EMAIL = original;
    }
  }
}

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  return runTrackedCron({
    jobKey: "cron-alert-dispatcher",
    jobName: "Cron Alert Dispatcher",
    routePath: "/api/cron/cron-alert-dispatcher",
    scheduleHint: "Vercel cron: */5 * * * *",
    isManuallyRunnable: true,
    handler: async () => {
      const schedulerSync = await syncPgCronOutcomes();
      const retrySince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: runs, error: runsError } = await supabaseAdmin
        .from("cron_job_runs")
        .select("id,job_key,status,started_at,created_at,completed_at,finished_at,duration_ms,message,details,error_message,alert_dispatched_at")
        .is("alert_dispatched_at", null)
        .gte("created_at", retrySince)
        .in("status", ["success", "failed", "error", "warning"])
        .order("created_at", { ascending: true })
        .limit(100);
      if (runsError) throw new Error(runsError.message);

      const jobKeys = Array.from(new Set((runs || []).map((run: any) => run.job_key).filter(Boolean)));
      const [{ data: jobs, error: jobsError }, { data: recentHistory, error: historyError }] = jobKeys.length
        ? await Promise.all([
            supabaseAdmin.from("cron_jobs").select("job_key,job_name,route_path,send_success_email,send_failure_email,email_recipients").in("job_key", jobKeys),
            supabaseAdmin
              .from("cron_job_runs")
              .select("id,job_key,status,started_at,created_at,completed_at,finished_at,error_message")
              .in("job_key", jobKeys)
              .gte("created_at", retrySince)
              .order("created_at", { ascending: true })
              .limit(500),
          ])
        : [{ data: [], error: null }, { data: [], error: null }] as any;
      if (jobsError) throw new Error(jobsError.message);
      if (historyError) throw new Error(historyError.message);
      const jobsByKey = new Map((jobs || []).map((job: any) => [job.job_key, job]));
      const decisionHistory = recentHistory || runs || [];

      let attempted = 0;
      let sent = 0;
      let failed = 0;
      let deferred = 0;
      let recovered = 0;
      for (const run of runs || []) {
        if (run.job_key === "cron-alert-dispatcher") continue;
        const job = jobsByKey.get(run.job_key);
        if (!job) continue;

        if (schedulerFailed(run.status) || run.error_message) {
          const decision = failureAlertDecision(run, decisionHistory);
          if (decision === "defer") {
            deferred += 1;
            continue;
          }
          if (decision === "recovered") {
            recovered += 1;
            await markRecoveredTransient(run);
            continue;
          }
        }

        const result = await dispatch(job, run);
        if (result.attempted) attempted += 1;
        if (result.sent) sent += 1;
        if (result.attempted && !result.sent) failed += 1;
      }

      const details = { scanned: runs?.length || 0, attempted, sent, failed, deferred, recovered, ...schedulerSync };
      return {
        message: `Cron alert dispatcher scanned ${details.scanned} runs, sent ${sent} alerts, and auto-resolved ${recovered} transient failures.`,
        details,
        response: NextResponse.json({ success: failed === 0, ...details }),
      };
    },
  });
}