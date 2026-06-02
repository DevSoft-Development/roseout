import { Resend } from "resend";
import { sendRenderedEmail } from "@/lib/email/sender";

type CronImportStep = {
  path: string;
  ok: boolean;
  status: number;
  data?: any;
  label?: string;
  category?: string | null;
  query?: string | null;
  importType?: string | null;
};

type EmailResult = { sent: boolean; provider?: string; error?: string | null };

function safeText(value: unknown, fallback = "N/A") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function getAdminEmailConfig() {
  return {
    to:
      process.env.ADMIN_ALERT_EMAIL ||
      process.env.SUPERADMIN_EMAIL ||
      "admin@theouthaven.com",
    from:
      process.env.ADMIN_EMAIL_FROM ||
      "TheOutHaven Admin <admin@theouthaven.com>",
    siteUrl:
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      "https://theouthaven.com",
  };
}

function formatDuration(durationMs: number) {
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function readMetric(data: any, key: string): number {
  const values = [data?.[key], data?.summary?.[key], data?.stats?.[key], data?.result?.[key]];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function pickMetric(data: any, key: string): number | null {
  const value = readMetric(data, key);
  return value === 0 ? null : value;
}

function getError(data: any): string | null {
  return data?.error || data?.message || data?.result?.error || data?.summary?.error || data?.stats?.error || null;
}

function sumMetric(steps: CronImportStep[], key: string) {
  return steps.reduce((sum, step) => sum + readMetric(step.data, key), 0);
}

function buildTotals(steps: CronImportStep[]) {
  return {
    found: sumMetric(steps, "found"),
    processed: sumMetric(steps, "processed"),
    imported: sumMetric(steps, "imported"),
    updated: sumMetric(steps, "updated"),
    migrated: sumMetric(steps, "migrated"),
    enriched: sumMetric(steps, "enriched"),
    skipped: sumMetric(steps, "skipped"),
    failed: sumMetric(steps, "failed"),
    needsPhoto: sumMetric(steps, "needsPhoto"),
    publishReady: sumMetric(steps, "publishReady"),
    review: sumMetric(steps, "review"),
    rejected: sumMetric(steps, "rejected"),
  };
}

function jobLabel(path: string) {
  if (path.includes("migrate-enriched-photos")) return "Google photo migration / repair";
  if (path.includes("enrich-high-value")) return "Google high-value photo enrichment";
  if (path.includes("google")) return "Google location import";
  if (path.includes("score-chunk")) return "Location scoring import";
  if (path.includes("location-growth")) return "Location growth import";
  return path.replace("/api/admin/", "").replaceAll("/", " / ");
}

function metricRow(label: string, value: number | null) {
  if (value === null || value === undefined) return "";
  return `<div style="display:flex;justify-content:space-between;border-top:1px solid #24242a;padding:8px 0;"><span style="color:#a9a9b2;">${label}</span><strong style="color:#ffffff;">${value}</strong></div>`;
}

function summaryCard(label: string, value: string | number | null | undefined, alwaysShow = false) {
  if (!alwaysShow && (value === null || value === undefined || value === "" || value === 0)) return "";
  return `<div style="background:#050506;border:1px solid #24242a;border-radius:14px;padding:16px;"><div style="color:#8f8f9a;font-size:12px;text-transform:uppercase;font-weight:800;letter-spacing:.04em;">${label}</div><div style="color:#ffffff;font-size:24px;font-weight:900;margin-top:6px;">${value}</div></div>`;
}

function buildStepHtml(step: CronImportStep) {
  const data = step.data || {};
  const error = getError(data);
  const metrics = [
    metricRow("Found", pickMetric(data, "found")),
    metricRow("Processed", pickMetric(data, "processed")),
    metricRow("Imported", pickMetric(data, "imported")),
    metricRow("Updated", pickMetric(data, "updated")),
    metricRow("Migrated", pickMetric(data, "migrated")),
    metricRow("Enriched", pickMetric(data, "enriched")),
    metricRow("Skipped", pickMetric(data, "skipped")),
    metricRow("Failed", pickMetric(data, "failed")),
    metricRow("Needs Photo", pickMetric(data, "needsPhoto")),
    metricRow("Publish Ready", pickMetric(data, "publishReady")),
    metricRow("Review", pickMetric(data, "review")),
    metricRow("Rejected", pickMetric(data, "rejected")),
  ].join("");
  const badgeBg = step.ok ? "#123f2a" : "#4a1218";
  const badgeColor = step.ok ? "#7ee2a8" : "#ff8c99";
  const badgeText = step.ok ? "Success" : "Failed";
  return `<div style="background:#121216;border:1px solid #25252d;border-radius:16px;padding:18px;margin:14px 0;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;"><div><div style="color:#ffffff;font-size:16px;font-weight:800;">${safeText(step.label || jobLabel(step.path))}</div><div style="color:#8f8f9a;font-size:12px;margin-top:4px;">${safeText(step.path)}</div></div><div style="background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:800;border-radius:999px;padding:6px 10px;white-space:nowrap;">${badgeText}</div></div><div style="margin-top:14px;">${metricRow("HTTP Status", step.status)}${metrics}</div>${error ? `<div style="margin-top:12px;background:#1b0f12;border:1px solid #4a1218;color:#ffb4bd;border-radius:12px;padding:12px;font-size:13px;line-height:1.5;"><strong>Error:</strong> ${String(error).slice(0, 900)}</div>` : ""}</div>`;
}

async function sendAdminHtmlEmail({ to, from, subject, html, text }: { to: string; from: string; subject: string; html: string; text: string }): Promise<EmailResult> {
  try {
    const existingResult = await sendRenderedEmail({
      to,
      rendered: { subject, preview: subject, html, text, department: "admin" as any },
      department: "admin",
    });

    if (existingResult.status === "sent") return { sent: true, provider: "existing-email-helper" };
    if (existingResult.status === "error") return { sent: false, provider: "existing-email-helper", error: existingResult.error || "Email helper failed" };

    if (!process.env.RESEND_API_KEY) {
      console.warn("Cron import summary email skipped: RESEND_API_KEY is missing.");
      return { sent: false, provider: "none", error: "RESEND_API_KEY is missing and no existing email helper was able to send." };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from, to, subject, html, text });
    return { sent: true, provider: "resend" };
  } catch (error: any) {
    console.error("Failed to send admin import summary email:", error);
    return { sent: false, provider: "error", error: error?.message || "Unknown email error" };
  }
}

export async function sendCronImportSummaryEmail({ success, cronName = "Cron Imports", startedAt, finishedAt, durationMs, steps }: { success: boolean; cronName?: string; startedAt: string; finishedAt: string; durationMs: number; steps: CronImportStep[] }) {
  const { to, from, siteUrl } = getAdminEmailConfig();
  const importDashboardUrl = `${siteUrl}/admin/dashboard/import`;
  const totals = buildTotals(steps);
  const totalJobs = steps.length;
  const successfulJobs = steps.filter((step) => step.ok).length;
  const failedJobs = steps.filter((step) => !step.ok).length;
  const totalWork = totals.processed || totals.found || totals.imported + totals.updated + totals.migrated + totals.enriched + totals.skipped + totals.failed + totals.publishReady + totals.review + totals.rejected;
  const successfulWork = Math.max(0, totalWork - totals.failed);
  const successRate = totalWork > 0 ? Math.round((successfulWork / totalWork) * 100) : success ? 100 : 0;
  const allFailed = totalJobs > 0 && failedJobs === totalJobs;
  const hasIssues = !success || failedJobs > 0 || totals.failed > 0;
  const subject = allFailed ? "❌ TheOutHaven Cron Imports Failed" : hasIssues ? "⚠️ TheOutHaven Cron Imports Completed With Errors" : "✅ TheOutHaven Cron Imports Completed";
  const statusColor = !hasIssues ? "#7ee2a8" : "#ff8c99";
  const statusText = !hasIssues ? "Completed Successfully" : allFailed ? "Failed" : "Completed With Issues";
  const durationText = formatDuration(durationMs);

  const html = `<div style="margin:0;padding:0;background:#050506;font-family:Arial,Helvetica,sans-serif;color:#ffffff;"><div style="max-width:760px;margin:0 auto;padding:32px 18px;"><div style="padding:22px 0;border-bottom:1px solid #24242a;"><div style="font-size:26px;font-weight:900;color:#ffffff;">TheOutHaven</div><div style="color:#F70A2A;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px;margin-top:6px;">Cron Import Summary</div></div><div style="background:#101014;border:1px solid #25252d;border-radius:20px;padding:24px;margin-top:24px;"><div style="color:${statusColor};font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;">${statusText}</div><h1 style="margin:10px 0 8px;font-size:28px;line-height:1.2;color:#ffffff;">${safeText(cronName)}</h1><p style="margin:0;color:#b6b6bf;font-size:15px;line-height:1.6;">The automatic cron import and photo backfill process has finished. Review the combined totals and step-by-step results below.</p><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:22px;">${summaryCard("Success Rate", `${successRate}%`, true)}${summaryCard("Duration", durationText, true)}${summaryCard("Successful Jobs", `${successfulJobs}/${totalJobs}`, true)}${summaryCard("Failed Jobs", failedJobs, true)}${summaryCard("Total Processed", totals.processed)}${summaryCard("Total Found", totals.found)}${summaryCard("Total Imported", totals.imported)}${summaryCard("Total Updated", totals.updated)}${summaryCard("Total Migrated", totals.migrated)}${summaryCard("Total Enriched", totals.enriched)}${summaryCard("Total Skipped", totals.skipped)}${summaryCard("Total Failed", totals.failed)}${summaryCard("Needs Photo", totals.needsPhoto)}${summaryCard("Publish Ready", totals.publishReady)}${summaryCard("Review", totals.review)}${summaryCard("Rejected", totals.rejected)}</div><div style="margin-top:22px;background:#050506;border:1px solid #24242a;border-radius:14px;padding:16px;color:#b6b6bf;font-size:13px;line-height:1.7;"><div><strong style="color:#ffffff;">Cron Name:</strong> ${safeText(cronName)}</div><div><strong style="color:#ffffff;">Started:</strong> ${safeText(startedAt)}</div><div><strong style="color:#ffffff;">Finished:</strong> ${safeText(finishedAt)}</div><div><strong style="color:#ffffff;">Site:</strong> ${safeText(siteUrl)}</div></div><div style="margin-top:24px;"><a href="${importDashboardUrl}" style="display:inline-block;background:#F70A2A;color:#ffffff;text-decoration:none;font-weight:900;border-radius:999px;padding:13px 18px;">View Import Dashboard</a></div></div><div style="margin-top:24px;"><h2 style="font-size:18px;color:#ffffff;margin:0 0 10px;">Step details</h2>${steps.map(buildStepHtml).join("")}</div><div style="color:#777781;font-size:12px;line-height:1.6;margin-top:26px;border-top:1px solid #24242a;padding-top:18px;">This message was automatically generated by TheOutHaven cron import system.</div></div></div>`;

  const text = [
    "TheOutHaven Cron Import Summary", "", `Status: ${statusText}`, `Cron name: ${cronName}`, `Success rate: ${successRate}%`, `Duration: ${durationText}`, `Successful jobs: ${successfulJobs}/${totalJobs}`, `Failed jobs: ${failedJobs}`, `Started: ${startedAt}`, `Finished: ${finishedAt}`, "", "Combined totals:", `Found: ${totals.found}`, `Processed: ${totals.processed}`, `Imported: ${totals.imported}`, `Updated: ${totals.updated}`, `Migrated: ${totals.migrated}`, `Enriched: ${totals.enriched}`, `Skipped: ${totals.skipped}`, `Failed: ${totals.failed}`, `Needs photo: ${totals.needsPhoto}`, `Publish ready: ${totals.publishReady}`, `Review: ${totals.review}`, `Rejected: ${totals.rejected}`, "", "Step details:",
    ...steps.map((step) => {
      const data = step.data || {}; const error = getError(data);
      return [`- ${step.label || jobLabel(step.path)}`, `  Path: ${step.path}`, `  Status: ${step.ok ? "Success" : "Failed"}`, `  HTTP: ${step.status}`, readMetric(data, "found") ? `  Found: ${readMetric(data, "found")}` : "", readMetric(data, "processed") ? `  Processed: ${readMetric(data, "processed")}` : "", readMetric(data, "imported") ? `  Imported: ${readMetric(data, "imported")}` : "", readMetric(data, "updated") ? `  Updated: ${readMetric(data, "updated")}` : "", readMetric(data, "migrated") ? `  Migrated: ${readMetric(data, "migrated")}` : "", readMetric(data, "enriched") ? `  Enriched: ${readMetric(data, "enriched")}` : "", readMetric(data, "skipped") ? `  Skipped: ${readMetric(data, "skipped")}` : "", readMetric(data, "failed") ? `  Failed: ${readMetric(data, "failed")}` : "", readMetric(data, "needsPhoto") ? `  Needs photo: ${readMetric(data, "needsPhoto")}` : "", readMetric(data, "publishReady") ? `  Publish ready: ${readMetric(data, "publishReady")}` : "", readMetric(data, "review") ? `  Review: ${readMetric(data, "review")}` : "", readMetric(data, "rejected") ? `  Rejected: ${readMetric(data, "rejected")}` : "", error ? `  Error: ${String(error).slice(0, 900)}` : ""].filter(Boolean).join("\n");
    }), "", `Import dashboard: ${importDashboardUrl}`,
  ].join("\n");

  return sendAdminHtmlEmail({ to, from, subject, html, text });
}

export async function sendNightlyImportSummaryEmail(args: { success: boolean; startedAt: string; finishedAt: string; durationMs: number; steps: CronImportStep[] }) {
  return sendCronImportSummaryEmail({ cronName: "Nightly Automatic Imports", ...args });
}

export async function sendGoogleImportSummaryEmail({ success, title, importType, category, query, startedAt, finishedAt, durationMs, summary, error }: { success: boolean; title?: string; importType?: string | null; category?: string | null; query?: string | null; startedAt?: string | null; finishedAt?: string | null; durationMs?: number | null; summary?: { found?: number | null; processed?: number | null; imported?: number | null; updated?: number | null; skipped?: number | null; failed?: number | null; needsPhoto?: number | null; publishReady?: number | null; review?: number | null; rejected?: number | null }; error?: string | null }) {
  const now = new Date().toISOString();
  return sendCronImportSummaryEmail({
    success,
    cronName: title || "Manual Google Import",
    startedAt: startedAt || now,
    finishedAt: finishedAt || now,
    durationMs: typeof durationMs === "number" ? durationMs : 0,
    steps: [{ path: "/manual/google-import", ok: success, status: success ? 200 : 500, label: title || "Manual Google Import", category, query, importType, data: { success, ...(summary || {}), error, startedAt, finishedAt, durationMs } }],
  });
}
