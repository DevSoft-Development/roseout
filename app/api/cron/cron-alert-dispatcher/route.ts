import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { sendCronImportSummaryEmail } from "@/lib/admin/nightlyImportEmail";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function configuredRecipients(job: any) {
  return Array.isArray(job?.email_recipients) && job.email_recipients.length ? job.email_recipients.map(String) : undefined;
}

async function dispatch(job: any, run: any) {
  const failed = ["failed", "error"].includes(String(run.status || "").toLowerCase()) || Boolean(run.error_message);
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
      const { data: runs, error: runsError } = await supabaseAdmin
        .from("cron_job_runs")
        .select("id,job_key,status,started_at,created_at,completed_at,finished_at,duration_ms,message,details,error_message,alert_dispatched_at")
        .is("alert_dispatched_at", null)
        .in("status", ["success", "failed", "error", "warning"])
        .order("created_at", { ascending: true })
        .limit(100);
      if (runsError) throw new Error(runsError.message);

      const jobKeys = Array.from(new Set((runs || []).map((run: any) => run.job_key).filter(Boolean)));
      const { data: jobs, error: jobsError } = jobKeys.length
        ? await supabaseAdmin.from("cron_jobs").select("job_key,job_name,route_path,send_success_email,send_failure_email,email_recipients").in("job_key", jobKeys)
        : { data: [], error: null } as any;
      if (jobsError) throw new Error(jobsError.message);
      const jobsByKey = new Map((jobs || []).map((job: any) => [job.job_key, job]));

      let attempted = 0;
      let sent = 0;
      let failed = 0;
      for (const run of runs || []) {
        if (run.job_key === "cron-alert-dispatcher") continue;
        const job = jobsByKey.get(run.job_key);
        if (!job) continue;
        const result = await dispatch(job, run);
        if (result.attempted) attempted += 1;
        if (result.sent) sent += 1;
        if (result.attempted && !result.sent) failed += 1;
      }

      const details = { scanned: runs?.length || 0, attempted, sent, failed };
      return {
        message: `Cron alert dispatcher scanned ${details.scanned} runs and sent ${sent} alerts.`,
        details,
        response: NextResponse.json({ success: failed === 0, ...details }),
      };
    },
  });
}
