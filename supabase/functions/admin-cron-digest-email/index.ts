import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminOrCron } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";
import { logCronJobRun } from "../_shared/cronLogger.ts";

type RunRow = Record<string, unknown>;
type ScheduledCronJob = {
  jobid: number | string;
  jobname: string;
  schedule: string;
  active: boolean;
  function_name: string | null;
  has_authorization_header: boolean;
  has_cron_secret_header: boolean;
  has_placeholder_values: boolean;
  has_supabase_function_url: boolean;
  warning_notes: string[];
};
type CronHealth = ScheduledCronJob & {
  job_name: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  recentSuccessCount: number;
  recentFailureCount: number;
  recentSkippedCount: number;
  hasRecentRun: boolean;
  hasRecentSuccess: boolean;
  healthStatus: "healthy" | "warning" | "failed";
  notes: string[];
};

type CronDigest = {
  hours: number;
  generatedAt: string;
  totals: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    successRate: number | null;
  };
  cronSummary: {
    totalScheduled: number;
    healthy: number;
    warnings: number;
    failed: number;
    noRecentRun: number;
    overallSuccessRate: number | null;
  };
  scheduledCronJobs: CronHealth[];
  topErrors: string[];
  photoBackfill: RunRow[];
  betaReminders: RunRow[];
  searchFunctions: RunRow[];
  searchHealthDigest: RunRow[];
  demoReset: RunRow[];
  teamSessionWatchdog: RunRow[];
  recentCronRuns: RunRow[];
  importRuns: RunRow[];
};

async function recent(supabase: any, table: string, since: string) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPercent(value: unknown) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${Math.round(Number(value) * 1000) / 10}%`;
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC";
}

function formatDuration(ms: unknown) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return "—";
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function statusColor(status: string) {
  const normalized = status.toLowerCase();
  if (["success", "healthy"].includes(normalized)) return { bg: "#dcfce7", color: "#166534", border: "#bbf7d0" };
  if (["failed", "error", "failure"].includes(normalized)) return { bg: "#fee2e2", color: "#991b1b", border: "#fecaca" };
  return { bg: "#fef3c7", color: "#92400e", border: "#fde68a" };
}

function statusBadge(status: unknown) {
  const text = String(status ?? "unknown");
  const colors = statusColor(text);
  return `<span style="display:inline-block;border:1px solid ${colors.border};background:${colors.bg};color:${colors.color};border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700;text-transform:capitalize">${escapeHtml(text)}</span>`;
}

function parseFunctionNameFromCommand(command: string) {
  const match = command.match(/\/functions\/v1\/([a-z0-9-_]+)/i);
  return match?.[1] ?? null;
}

function sanitizeCronJobCommandSummary(command: string) {
  return {
    function_name: parseFunctionNameFromCommand(command),
    has_authorization_header: /authorization/i.test(command),
    has_cron_secret_header: /x-cron-secret/i.test(command),
    has_placeholder_values: /YOUR_PROJECT_REF|YOUR_CRON_SECRET|PASTE_/i.test(command),
    has_supabase_function_url: /functions\/v1\//i.test(command),
  };
}

function scheduleMayRunWithinHours(schedule: string, hours: number) {
  const parts = String(schedule).trim().split(/\s+/);
  if (parts.length !== 5) return true;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (minute.startsWith("*/")) return true;
  if (hour === "*" || hour.startsWith("*/")) return hours >= 1;
  if (dayOfMonth === "*" && month === "*" && (dayOfWeek === "*" || dayOfWeek.includes("-"))) return hours >= 24;
  return hours >= 24;
}

function isFailedStatus(status: unknown) {
  return ["failed", "error", "failure"].some((needle) => String(status ?? "").toLowerCase().includes(needle));
}

function isSkippedStatus(status: unknown) {
  return String(status ?? "").toLowerCase().includes("skip");
}

function summarizeCronHealth(scheduledJobs: ScheduledCronJob[], recentRuns: RunRow[], hours: number): CronHealth[] {
  return scheduledJobs.map((job) => {
    const functionName = job.function_name;
    const matchingRuns = recentRuns.filter((run) =>
      run.job_name === job.jobname ||
      (functionName && run.function_name === functionName) ||
      (functionName && run.job_name === functionName)
    );
    const lastRun = matchingRuns[0] ?? null;
    const recentSuccessCount = matchingRuns.filter((run) => String(run.status).toLowerCase() === "success").length;
    const recentFailureCount = matchingRuns.filter((run) => isFailedStatus(run.status)).length;
    const recentSkippedCount = matchingRuns.filter((run) => isSkippedStatus(run.status)).length;
    const notes = [...(job.warning_notes ?? [])];

    if (!job.active) notes.push("Inactive cron job");
    if (!job.has_authorization_header) notes.push("Missing Authorization header");
    if (!job.has_cron_secret_header) notes.push("Missing x-cron-secret header");
    if (job.has_placeholder_values) notes.push("Placeholder values detected");
    if (!job.has_supabase_function_url) notes.push("No Supabase Edge Function URL detected");
    if (lastRun && isFailedStatus(lastRun.status)) notes.push("Latest run failed");
    if (!lastRun && scheduleMayRunWithinHours(job.schedule, hours)) notes.push("No recent run logged");

    const hasFailure = !job.has_authorization_header || !job.has_cron_secret_header || job.has_placeholder_values || (lastRun && isFailedStatus(lastRun.status));
    const hasWarning = !job.active || !lastRun || notes.length > 0;
    const healthStatus = hasFailure ? "failed" : hasWarning ? "warning" : "healthy";

    return {
      ...job,
      job_name: job.jobname,
      lastRunAt: String(lastRun?.finished_at ?? lastRun?.created_at ?? "") || null,
      lastStatus: String(lastRun?.status ?? "") || null,
      lastError: String(lastRun?.error_message ?? "") || null,
      recentSuccessCount,
      recentFailureCount,
      recentSkippedCount,
      hasRecentRun: Boolean(lastRun),
      hasRecentSuccess: recentSuccessCount > 0,
      healthStatus,
      notes,
    };
  });
}

async function scheduledCronJobs(supabase: any): Promise<ScheduledCronJob[]> {
  try {
    const { data, error } = await supabase.rpc("get_theouthaven_cron_job_health");
    if (error || !Array.isArray(data)) return [];
    return data.map((row: any) => ({
      jobid: row.jobid,
      jobname: String(row.jobname ?? ""),
      schedule: String(row.schedule ?? ""),
      active: Boolean(row.active),
      function_name: row.function_name ? String(row.function_name) : null,
      has_authorization_header: Boolean(row.has_authorization_header),
      has_cron_secret_header: Boolean(row.has_cron_secret_header),
      has_placeholder_values: Boolean(row.has_placeholder_values),
      has_supabase_function_url: Boolean(row.has_supabase_function_url),
      warning_notes: Array.isArray(row.warning_notes) ? row.warning_notes.map(String) : [],
    })).filter((row: ScheduledCronJob) => row.jobname);
  } catch {
    return [];
  }
}

function sectionRows(title: string, rows: RunRow[]) {
  if (!rows.length) return "";
  const body = rows.slice(0, 10).map((row) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb">${escapeHtml(row.job_name ?? row.function_name ?? "—")}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb">${statusBadge(row.status)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(row.checked_count ?? "—")}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(row.success_count ?? "—")}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(row.skipped_count ?? "—")}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(row.failed_count ?? "—")}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${formatPercent(row.success_rate)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${formatDuration(row.duration_ms)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb">${formatDate(row.started_at ?? row.created_at)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb">${escapeHtml(row.error_message ?? "—")}</td>
    </tr>`).join("");
  return `<h2 style="margin:28px 0 10px;font-size:18px;color:#111827">${escapeHtml(title)}</h2><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-size:13px"><thead><tr style="background:#f9fafb;color:#374151"><th align="left" style="padding:10px">Job</th><th align="left" style="padding:10px">Status</th><th align="right" style="padding:10px">Checked</th><th align="right" style="padding:10px">Success</th><th align="right" style="padding:10px">Skipped</th><th align="right" style="padding:10px">Failed</th><th align="right" style="padding:10px">Success rate</th><th align="right" style="padding:10px">Duration</th><th align="left" style="padding:10px">Started at</th><th align="left" style="padding:10px">Error</th></tr></thead><tbody>${body}</tbody></table>`;
}

function buildCronDigestHtml(digest: CronDigest, options: { hours: number }) {
  const summary = digest.cronSummary;
  const banner = summary.failed > 0
    ? { text: "One or more cron jobs failed", bg: "#fef2f2", color: "#991b1b", border: "#fecaca" }
    : summary.warnings > 0
      ? { text: "Some jobs need attention", bg: "#fffbeb", color: "#92400e", border: "#fde68a" }
      : { text: "All monitored cron jobs are healthy", bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" };
  const cards = [
    ["Total scheduled cron jobs", summary.totalScheduled],
    ["Jobs healthy", summary.healthy],
    ["Jobs with warnings", summary.warnings],
    ["Jobs failed", summary.failed],
    ["Jobs with no recent run", summary.noRecentRun],
    ["Overall success rate", formatPercent(summary.overallSuccessRate)],
  ];
  const scheduledRows = digest.scheduledCronJobs.map((job) => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb"><b>${escapeHtml(job.jobname)}</b><br/>${statusBadge(job.healthStatus)}</td>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb">${job.active ? "Yes" : "No"}</td>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-family:ui-monospace,Consolas,monospace">${escapeHtml(job.schedule)}</td>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb">${escapeHtml(job.function_name ?? "—")}</td>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb">Authorization: <b>${job.has_authorization_header ? "yes" : "no"}</b><br/>Cron secret: <b>${job.has_cron_secret_header ? "yes" : "no"}</b></td>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb">${formatDate(job.lastRunAt)}</td>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb">${job.lastStatus ? statusBadge(job.lastStatus) : "—"}</td>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb">${job.notes.length ? escapeHtml(job.notes.join("; ")) : "—"}</td>
    </tr>`).join("");
  const topErrors = digest.topErrors.length ? `<h2 style="margin:28px 0 10px;font-size:18px;color:#111827">Top Errors</h2>${digest.topErrors.map((error) => `<div style="border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:12px;padding:12px;margin:8px 0">${escapeHtml(error)}</div>`).join("")}` : "";

  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;padding:24px;font-family:Inter,Arial,sans-serif;color:#111827"><div style="max-width:960px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden"><div style="padding:28px 32px;border-bottom:1px solid #e5e7eb"><div style="font-size:13px;font-weight:800;color:#be123c;text-transform:uppercase;letter-spacing:.08em">TheOutHaven Admin</div><h1 style="margin:8px 0 6px;font-size:28px;line-height:1.2">Cron/import digest</h1><div style="color:#6b7280">Last ${options.hours} hours · Generated at ${formatDate(digest.generatedAt)}</div></div><div style="padding:24px 32px"><div style="border:1px solid ${banner.border};background:${banner.bg};color:${banner.color};border-radius:14px;padding:14px 16px;font-weight:800">${banner.text}</div><div style="display:block;margin:18px 0">${cards.map(([label, value]) => `<div style="display:inline-block;vertical-align:top;width:29%;min-width:160px;border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin:0 8px 10px 0"><div style="font-size:12px;color:#6b7280">${escapeHtml(label)}</div><div style="font-size:24px;font-weight:900;color:#111827">${escapeHtml(value)}</div></div>`).join("")}</div><h2 style="margin:28px 0 10px;font-size:18px;color:#111827">Scheduled Cron Jobs</h2><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-size:13px"><thead><tr style="background:#f9fafb;color:#374151"><th align="left" style="padding:12px">Job</th><th align="left" style="padding:12px">Active</th><th align="left" style="padding:12px">Schedule</th><th align="left" style="padding:12px">Function</th><th align="left" style="padding:12px">Auth</th><th align="left" style="padding:12px">Last run</th><th align="left" style="padding:12px">Last status</th><th align="left" style="padding:12px">Notes</th></tr></thead><tbody>${scheduledRows || `<tr><td colspan="8" style="padding:12px">No scheduled cron jobs returned by diagnostics RPC.</td></tr>`}</tbody></table>${topErrors}${sectionRows("Photo backfill", digest.photoBackfill)}${sectionRows("Beta reminders", digest.betaReminders)}${sectionRows("Search functions", digest.searchFunctions)}${sectionRows("Search health digest", digest.searchHealthDigest)}${sectionRows("Demo reset", digest.demoReset)}${sectionRows("Team session watchdog", digest.teamSessionWatchdog)}</div><div style="padding:20px 32px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">TheOutHaven Admin<br/>This automated digest was generated by TheOutHaven cron monitoring.<br/>Do not include secrets.</div></div></body></html>`;
}

function buildCronDigestText(digest: CronDigest, options: { hours: number; debug?: boolean }) {
  const lines = [
    "TheOutHaven Admin",
    "Cron/import digest",
    `Last ${options.hours} hours`,
    `Generated at ${formatDate(digest.generatedAt)}`,
    "",
    "Summary",
    `- Total scheduled cron jobs: ${digest.cronSummary.totalScheduled}`,
    `- Jobs healthy: ${digest.cronSummary.healthy}`,
    `- Jobs with warnings: ${digest.cronSummary.warnings}`,
    `- Jobs failed: ${digest.cronSummary.failed}`,
    `- Jobs with no recent run: ${digest.cronSummary.noRecentRun}`,
    `- Overall success rate: ${formatPercent(digest.cronSummary.overallSuccessRate)}`,
    "",
    "Scheduled cron jobs",
    ...(digest.scheduledCronJobs.length ? digest.scheduledCronJobs.map((job) => `- ${job.jobname} (${job.schedule}) ${job.healthStatus}; active=${job.active ? "yes" : "no"}; function=${job.function_name ?? "—"}; auth=${job.has_authorization_header ? "yes" : "no"}; cronSecret=${job.has_cron_secret_header ? "yes" : "no"}; last=${formatDate(job.lastRunAt)} ${job.lastStatus ?? "—"}; notes=${job.notes.join("; ") || "—"}`) : ["- No scheduled cron jobs returned by diagnostics RPC."]),
    "",
    "Top errors",
    ...(digest.topErrors.length ? digest.topErrors.map((error) => `- ${error}`) : ["- None"]),
    "",
    "Key section summaries",
    `- Photo backfill runs: ${digest.photoBackfill.length}`,
    `- Beta reminder runs: ${digest.betaReminders.length}`,
    `- Search function runs: ${digest.searchFunctions.length}`,
    `- Search health digest runs: ${digest.searchHealthDigest.length}`,
    `- Demo reset runs: ${digest.demoReset.length}`,
    `- Team session watchdog runs: ${digest.teamSessionWatchdog.length}`,
  ];
  if (options.debug) lines.push("", "Debug digest", JSON.stringify(digest, null, 2));
  return lines.join("\n");
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const timer = startTimer();
  const startedAt = new Date().toISOString();
  const supabase = createSupabaseAdminClient();
  let authSource = "unknown";
  try {
    const auth = await requireAdminOrCron(req, supabase);
    authSource = auth.source;
    const body = await req.json().catch(() => ({}));
    const hours = Math.min(Math.max(Number(body.hours ?? 24), 1), 168);
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const edge = await recent(supabase, "edge_function_logs", since);
    const cron = await recent(supabase, "cron_job_runs", since);
    const imports = await recent(supabase, "import_job_runs", since);
    const scheduled = await scheduledCronJobs(supabase);
    const scheduledHealth = summarizeCronHealth(scheduled, cron, hours);
    const all = [...edge, ...cron, ...imports];
    const failed = all.filter((row: RunRow) => isFailedStatus(row.status));
    const skipped = all.filter((row: RunRow) => isSkippedStatus(row.status));
    const topErrors = failed.map((row: RunRow) => row.error_message).filter(Boolean).map(String).slice(0, 10);
    const cronSummary = {
      totalScheduled: scheduledHealth.length,
      healthy: scheduledHealth.filter((job) => job.healthStatus === "healthy").length,
      warnings: scheduledHealth.filter((job) => job.healthStatus === "warning").length,
      failed: scheduledHealth.filter((job) => job.healthStatus === "failed").length,
      noRecentRun: scheduledHealth.filter((job) => !job.hasRecentRun).length,
      overallSuccessRate: cron.length ? cron.filter((row: RunRow) => String(row.status).toLowerCase() === "success").length / cron.length : null,
    };
    const digest: CronDigest = {
      hours,
      generatedAt: new Date().toISOString(),
      totals: {
        total: all.length,
        successful: all.length - failed.length - skipped.length,
        failed: failed.length,
        skipped: skipped.length,
        successRate: all.length ? (all.length - failed.length) / all.length : null,
      },
      cronSummary,
      scheduledCronJobs: scheduledHealth,
      topErrors,
      photoBackfill: cron.filter((row: RunRow) => row.job_name === "nightly-photo-backfill"),
      betaReminders: cron.filter((row: RunRow) => row.job_name === "beta-tester-reminders"),
      searchFunctions: edge.filter((row: RunRow) => ["create-search", "parse-search-intent"].includes(String(row.function_name))),
      searchHealthDigest: cron.filter((row: RunRow) => row.job_name === "admin-search-health-digest" || row.function_name === "admin-search-health-digest"),
      demoReset: cron.filter((row: RunRow) => row.job_name === "nightly-demo-reset" || row.function_name === "nightly-demo-reset"),
      teamSessionWatchdog: cron.filter((row: RunRow) => row.job_name === "team-session-watchdog" || row.function_name === "team-session-watchdog"),
      recentCronRuns: cron,
      importRuns: imports,
    };
    let emailResult: any = { sent: false, skipped: true, reason: "sendEmail=false" };
    if (body.sendEmail !== false) {
      const to = Deno.env.get("ADMIN_EMAIL");
      emailResult = to
        ? await sendEmail({
            to,
            subject: "TheOutHaven cron/import digest",
            html: buildCronDigestHtml(digest, { hours }),
            text: buildCronDigestText(digest, { hours, debug: body.debug === true }),
          })
        : { sent: false, skipped: true, reason: "ADMIN_EMAIL missing" };
      emailResult.sent = Boolean(emailResult.id);
    }
    await logCronJobRun(supabase, {
      job_name: "admin-cron-digest-email",
      function_name: "admin-cron-digest-email",
      source: "digest_self",
      status: "success",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: timer(),
      checked_count: scheduledHealth.length,
      success_count: cronSummary.healthy,
      skipped_count: cronSummary.noRecentRun,
      failed_count: cronSummary.failed,
      success_rate: scheduledHealth.length ? cronSummary.healthy / scheduledHealth.length : null,
      metadata: { selfDigest: true, emailSent: Boolean(emailResult.sent) },
    });
    await logEdgeFunctionRun(supabase, { function_name: "admin-cron-digest-email", status: "success", source: auth.source, duration_ms: timer(), output_summary: digest.totals, metadata: { emailResult } });
    return ok({ success: true, digest, scheduledCronJobs: scheduledHealth, email: emailResult });
  } catch (error) {
    const message = safeError(error);
    await logCronJobRun(supabase, { job_name: "admin-cron-digest-email", function_name: "admin-cron-digest-email", source: "digest_self", status: "failed", started_at: startedAt, finished_at: new Date().toISOString(), duration_ms: timer(), failed_count: 1, error_message: message, metadata: { selfDigest: true, authSource } });
    await logEdgeFunctionRun(supabase, { function_name: "admin-cron-digest-email", status: "error", error_message: message, duration_ms: timer() });
    return serverError("admin-cron-digest-email failed", message);
  }
});
