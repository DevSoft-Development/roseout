import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminOrCron } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

type Row = Record<string, any>;

const BRAND = {
  bg: "#090706",
  card: "#141010",
  elevated: "#1c1614",
  border: "rgba(255,255,255,0.12)",
  text: "#fff7f2",
  muted: "#b8aaa3",
  subtle: "#8f817a",
  red: "#e1062a",
  green: "#70df8b",
  amber: "#f5c76b",
  blue: "#8fb8ff",
};

async function recent(supabase: any, table: string, since: string) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
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

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isFailed(status: unknown) {
  const value = String(status ?? "").toLowerCase();
  return value.includes("fail") || value.includes("error");
}

function isSkipped(status: unknown) {
  return String(status ?? "").toLowerCase().includes("skip");
}

function formatEastern(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function friendlyName(row: Row) {
  return String(row.job_name || row.job_key || row.function_name || "System job")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function flattenNumbers(value: unknown, prefix = "", output: Record<string, number> = {}) {
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "number" && Number.isFinite(child)) output[path.toLowerCase()] = child;
    else if (child && typeof child === "object" && !Array.isArray(child)) flattenNumbers(child, path, output);
  }
  return output;
}

const ADDED = /(added|created|inserted|imported|discovered|new_|new$|photos_added|locations_added|events_added|records_added)/i;
const FIXED = /(fixed|repaired|reconciled|recovered|restored|corrected|resolved|backfilled)/i;
const UPDATED = /(updated|enriched|synced|applied|refreshed|changed)/i;

function materialChanges(row: Row) {
  const details = flattenNumbers(row.details ?? row.metadata ?? {});
  let added = 0;
  let fixed = 0;
  let updated = 0;

  for (const [key, value] of Object.entries(details)) {
    if (value <= 0) continue;
    if (ADDED.test(key)) added += value;
    else if (FIXED.test(key)) fixed += value;
    else if (UPDATED.test(key)) updated += value;
  }

  const job = String(row.job_key || row.job_name || row.function_name || "");
  const successes = number(row.success_count);
  if (successes > 0 && added + fixed + updated === 0) {
    if (/(repair|reconcile|cleanup|reset|backfill)/i.test(job)) fixed += successes;
    else if (/(enrich|sync|update|profile|description)/i.test(job)) updated += successes;
    else if (/(discover|import|ingest|photo)/i.test(job)) added += successes;
  }

  return { added, fixed, updated };
}

function collectChanges(rows: Row[]) {
  const items: Array<{ type: "added" | "fixed" | "updated"; count: number; job: string; note: string }> = [];
  let added = 0;
  let fixed = 0;
  let updated = 0;

  for (const row of rows) {
    const change = materialChanges(row);
    const note = String(row.message || row.output_summary || "");
    if (change.added > 0) {
      added += change.added;
      items.push({ type: "added", count: change.added, job: friendlyName(row), note });
    }
    if (change.fixed > 0) {
      fixed += change.fixed;
      items.push({ type: "fixed", count: change.fixed, job: friendlyName(row), note });
    }
    if (change.updated > 0) {
      updated += change.updated;
      items.push({ type: "updated", count: change.updated, job: friendlyName(row), note });
    }
  }

  return { added, fixed, updated, items: items.slice(0, 24) };
}

function statCard(label: string, value: string | number, helper: string) {
  return `<td width="33.33%" valign="top" style="padding:6px"><div style="background:${BRAND.elevated};border:1px solid ${BRAND.border};border-radius:14px;padding:16px"><div style="font-size:11px;color:${BRAND.subtle};font-weight:800;text-transform:uppercase;letter-spacing:.06em">${escapeHtml(label)}</div><div style="margin-top:5px;font-size:25px;line-height:30px;color:${BRAND.text};font-weight:850">${escapeHtml(value)}</div><div style="margin-top:4px;font-size:12px;line-height:18px;color:${BRAND.muted}">${escapeHtml(helper)}</div></div></td>`;
}

function changeRows(items: ReturnType<typeof collectChanges>["items"]) {
  if (!items.length) {
    return `<div style="padding:16px;border:1px solid ${BRAND.border};background:${BRAND.elevated};border-radius:14px;color:${BRAND.muted};font-size:14px;line-height:22px">No material additions, repairs, or updates were reported during this period.</div>`;
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items.map((item) => {
    const color = item.type === "added" ? BRAND.green : item.type === "fixed" ? BRAND.amber : BRAND.blue;
    const label = item.type === "added" ? "ADDED" : item.type === "fixed" ? "FIXED" : "UPDATED";
    const note = item.note && item.note.length <= 180 ? item.note : "This job reported a material project change.";
    return `<tr><td valign="top" style="padding:11px 0;border-bottom:1px solid ${BRAND.border}"><span style="display:inline-block;padding:4px 8px;border-radius:999px;background:${color}20;color:${color};font-size:10px;font-weight:850">${label}</span></td><td valign="top" style="padding:11px 10px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:14px;font-weight:750">${escapeHtml(item.job)}</td><td valign="top" align="right" style="padding:11px 10px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:15px;font-weight:850">${item.count}</td><td valign="top" style="padding:11px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:12px;line-height:18px">${escapeHtml(note)}</td></tr>`;
  }).join("")}</table>`;
}

function issueRows(rows: Row[]) {
  if (!rows.length) {
    return `<div style="padding:16px;border:1px solid ${BRAND.border};background:${BRAND.elevated};border-radius:14px;color:${BRAND.green};font-size:14px;font-weight:750">Nothing needs your attention.</div>`;
  }
  return rows.slice(0, 12).map((row) => `<div style="padding:14px 16px;margin:8px 0;border:1px solid rgba(225,6,42,.4);background:rgba(225,6,42,.09);border-radius:14px"><div style="color:${BRAND.text};font-size:14px;font-weight:800">${escapeHtml(friendlyName(row))}</div><div style="margin-top:4px;color:${BRAND.muted};font-size:12px;line-height:18px">${escapeHtml(row.error_message || row.message || "The job reported a failure.")}</div><div style="margin-top:5px;color:${BRAND.subtle};font-size:11px">${escapeHtml(formatEastern(row.finished_at || row.completed_at || row.created_at))}</div></div>`).join("");
}

function activityRows(rows: Row[]) {
  const latest = new Map<string, Row>();
  for (const row of rows) {
    const key = String(row.job_key || row.job_name || row.function_name || "unknown");
    if (!latest.has(key) && String(row.status).toLowerCase() !== "running") latest.set(key, row);
  }
  return [...latest.values()].slice(0, 30).map((row) => {
    const failed = isFailed(row.status);
    const skipped = isSkipped(row.status);
    const status = failed ? "Needs attention" : skipped ? "Skipped" : "Healthy";
    const color = failed ? BRAND.red : skipped ? BRAND.amber : BRAND.green;
    return `<tr><td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;font-weight:700">${escapeHtml(friendlyName(row))}</td><td style="padding:10px;border-bottom:1px solid ${BRAND.border}"><span style="color:${color};font-size:12px;font-weight:800">${status}</span></td><td align="right" style="padding:10px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:12px">${escapeHtml(formatEastern(row.finished_at || row.completed_at || row.created_at))}</td></tr>`;
  }).join("");
}

function buildHtml(input: {
  hours: number;
  jobs: Row[];
  cronRuns: Row[];
  edgeRuns: Row[];
  changes: ReturnType<typeof collectChanges>;
  failures: Row[];
}) {
  const { hours, jobs, cronRuns, edgeRuns, changes, failures } = input;
  const allRuns = [...cronRuns, ...edgeRuns];
  const total = allRuns.length;
  const successful = allRuns.filter((row) => !isFailed(row.status) && !isSkipped(row.status) && String(row.status).toLowerCase() !== "running").length;
  const skipped = allRuns.filter((row) => isSkipped(row.status)).length;
  const issueCount = failures.length;
  const changeTotal = changes.added + changes.fixed + changes.updated;
  const allGood = issueCount === 0;
  const headline = allGood ? "Your scheduled systems are healthy" : `${issueCount} item${issueCount === 1 ? "" : "s"} need attention`;
  const subtitle = allGood ? `${successful} runs completed successfully in the last ${hours} hours.` : "Most jobs completed normally, but review the issues below.";

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><style>@media(max-width:620px){.shell{width:100%!important}.pad{padding-left:20px!important;padding-right:20px!important}.stats td{display:block!important;width:100%!important}}</style></head><body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${BRAND.text}"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(headline)} · ${changeTotal} project changes · ${issueCount} issues</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.bg}"><tr><td align="center" style="padding:28px 12px"><table role="presentation" class="shell" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:640px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:20px;overflow:hidden"><tr><td class="pad" style="padding:24px 32px;border-bottom:1px solid ${BRAND.border}"><table width="100%"><tr><td width="48"><img src="https://theouthaven.com/toh_logo.png" width="40" height="40" alt="TheOutHaven" style="display:block;border:0"></td><td style="color:${BRAND.text};font-size:16px;font-weight:850">TheOutHaven<br><span style="color:${BRAND.subtle};font-size:12px;font-weight:650">Daily System Health</span></td><td align="right"><span style="display:inline-block;padding:7px 11px;border-radius:999px;background:${allGood ? "#17351f" : "rgba(225,6,42,.14)"};color:${allGood ? BRAND.green : BRAND.red};font-size:11px;font-weight:850">${allGood ? "ALL GOOD" : "REVIEW"}</span></td></tr></table></td></tr><tr><td class="pad" style="padding:30px 32px 12px"><h1 style="margin:0;color:${BRAND.text};font-size:28px;line-height:34px">${escapeHtml(headline)}</h1><p style="margin:9px 0 0;color:${BRAND.muted};font-size:15px;line-height:23px">${escapeHtml(subtitle)}</p><p style="margin:7px 0 0;color:${BRAND.subtle};font-size:12px">Last ${hours} hours · ${escapeHtml(formatEastern(new Date().toISOString()))}</p></td></tr><tr><td class="pad" style="padding:14px 26px 8px"><table class="stats" width="100%" cellspacing="0" cellpadding="0"><tr>${statCard("Project changes", changeTotal, `${changes.added} added · ${changes.fixed} fixed · ${changes.updated} updated`)}${statCard("Jobs reported", jobs.length, "Selected in Cron Jobs admin")}${statCard("Issues", issueCount, issueCount ? "Review below" : "Nothing needs you")}</tr><tr>${statCard("Successful runs", successful, `${total} logged runs`)}${statCard("Skipped", skipped, "Intentional or no-work runs")}${statCard("Edge activity", edgeRuns.length, "Supabase Edge Function runs")}</tr></table></td></tr><tr><td class="pad" style="padding:22px 32px 8px"><div style="color:${BRAND.text};font-size:18px;font-weight:850">What changed in TheOutHaven</div><p style="margin:5px 0 14px;color:${BRAND.muted};font-size:13px;line-height:20px">Only material additions, fixes, and updates are shown here—not jobs that merely ran.</p>${changeRows(changes.items)}</td></tr><tr><td class="pad" style="padding:24px 32px 8px"><div style="color:${BRAND.text};font-size:18px;font-weight:850">Needs your attention</div><p style="margin:5px 0 12px;color:${BRAND.muted};font-size:13px">Failures and errors across the cron and Edge jobs you selected for this email.</p>${issueRows(failures)}</td></tr><tr><td class="pad" style="padding:24px 32px 30px"><div style="color:${BRAND.text};font-size:18px;font-weight:850">Latest job status</div><p style="margin:5px 0 12px;color:${BRAND.muted};font-size:13px">One simple status per job. Raw JSON is intentionally omitted.</p><table width="100%" cellspacing="0" cellpadding="0">${activityRows(cronRuns)}</table></td></tr><tr><td class="pad" style="padding:20px 32px 24px;border-top:1px solid ${BRAND.border};background:#100d0c;color:${BRAND.subtle};font-size:11px;line-height:17px">TheOutHaven.com · Admin system-health email<br>This is the single consolidated cron and Edge Function digest.</td></tr></table></td></tr></table></body></html>`;
}

function buildText(input: { hours: number; jobs: Row[]; cronRuns: Row[]; edgeRuns: Row[]; changes: ReturnType<typeof collectChanges>; failures: Row[] }) {
  const changeTotal = input.changes.added + input.changes.fixed + input.changes.updated;
  return [
    "TheOutHaven Daily System Health",
    input.failures.length ? `${input.failures.length} item(s) need attention` : "All scheduled systems are healthy",
    `Last ${input.hours} hours`,
    "",
    `Project changes: ${changeTotal}`,
    `- Added: ${input.changes.added}`,
    `- Fixed: ${input.changes.fixed}`,
    `- Updated: ${input.changes.updated}`,
    `- Jobs included in email: ${input.jobs.length}`,
    `- Cron runs: ${input.cronRuns.length}`,
    `- Edge Function runs: ${input.edgeRuns.length}`,
    `- Issues: ${input.failures.length}`,
    "",
    "Needs attention",
    ...(input.failures.length ? input.failures.slice(0, 12).map((row) => `- ${friendlyName(row)}: ${row.error_message || row.message || "Failed"}`) : ["- Nothing needs your attention."]),
  ].join("\n");
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const timer = startTimer();
  const supabase = createSupabaseAdminClient();

  try {
    const auth = await requireAdminOrCron(req, supabase);
    const body = await req.json().catch(() => ({}));
    const hours = Math.min(Math.max(Number(body.hours ?? 24), 1), 168);
    const since = new Date(Date.now() - hours * 3600000).toISOString();

    const { data: registry, error: registryError } = await supabase
      .from("cron_jobs")
      .select("job_key, job_name, is_active, include_in_daily_digest")
      .order("job_name");
    if (registryError) throw registryError;

    const includedJobs = (registry ?? []).filter((job: Row) => job.include_in_daily_digest !== false);
    const includedKeys = new Set(includedJobs.map((job: Row) => String(job.job_key)));

    const cronAll = await recent(supabase, "cron_job_runs", since);
    const edgeAll = await recent(supabase, "edge_function_logs", since);
    const cronRuns = cronAll.filter((row: Row) => includedKeys.has(String(row.job_key || row.job_name || row.function_name)));
    const edgeRuns = edgeAll.filter((row: Row) => includedKeys.has(String(row.function_name || row.job_key || row.job_name)));
    const combined = [...cronRuns, ...edgeRuns];
    const failures = combined.filter((row: Row) => isFailed(row.status));
    const changes = collectChanges(combined);
    const changeTotal = changes.added + changes.fixed + changes.updated;

    const input = { hours, jobs: includedJobs, cronRuns, edgeRuns, changes, failures };
    const subject = `TheOutHaven Daily System Health — ${changeTotal} change${changeTotal === 1 ? "" : "s"}, ${failures.length} issue${failures.length === 1 ? "" : "s"}`;

    let emailResult: any = { sent: false, skipped: true, reason: "sendEmail=false" };
    if (body.sendEmail !== false) {
      const to = Deno.env.get("ADMIN_CRON_DIGEST_EMAIL") || Deno.env.get("ADMIN_EMAIL") || Deno.env.get("SUPERADMIN_EMAIL") || Deno.env.get("ADMIN_ALERT_EMAIL");
      emailResult = to
        ? await sendEmail({ to, subject, html: buildHtml(input), text: buildText(input) })
        : { sent: false, skipped: true, reason: "No admin digest recipient configured" };
    }

    await logEdgeFunctionRun(supabase, {
      function_name: "admin-cron-digest-email",
      status: "success",
      source: auth.source,
      duration_ms: timer(),
      output_summary: {
        includedJobs: includedJobs.length,
        cronRuns: cronRuns.length,
        edgeRuns: edgeRuns.length,
        added: changes.added,
        fixed: changes.fixed,
        updated: changes.updated,
        failures: failures.length,
      },
      metadata: { emailResult },
    });

    return ok({ success: true, digest: input, email: emailResult });
  } catch (error) {
    const message = safeError(error);
    await logEdgeFunctionRun(supabase, {
      function_name: "admin-cron-digest-email",
      status: "error",
      error_message: message,
      duration_ms: timer(),
    });
    return serverError("admin-cron-digest-email failed", message);
  }
});
