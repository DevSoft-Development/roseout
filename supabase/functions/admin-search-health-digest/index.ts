import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError, unauthorized } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";

type EventRow = Record<string, any>;

function validCronSecret(req: Request) {
  const expected = Deno.env.get("CRON_SECRET");
  return Boolean(expected && req.headers.get("x-cron-secret") === expected);
}

function recipients() {
  return (Deno.env.get("SEARCH_HEALTH_DIGEST_TO") || Deno.env.get("ADMIN_EMAIL") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function siteUrl() {
  return (Deno.env.get("NEXT_PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://theouthaven.com").replace(/\/$/, "");
}

function countBy(rows: EventRow[], key: string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const value = typeof row[key] === "string" && row[key].trim() ? row[key].trim() : null;
    if (!value) continue;
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return Array.from(map, ([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, 10);
}

function commonFailingQueries(rows: EventRow[]) {
  const issueTypes = new Set(["no_valid_pairs", "no_results", "no_activity_results", "no_restaurant_results", "search_error"]);
  const map = new Map<string, { query: string; count: number }>();
  for (const row of rows) {
    if (!issueTypes.has(String(row.event_type)) && !row.no_pairs_reason && !row.no_results_reason) continue;
    const query = typeof row.raw_query === "string" ? row.raw_query.trim() : "";
    if (!query) continue;
    const key = query.toLowerCase();
    const current = map.get(key) ?? { query, count: 0 };
    current.count += 1;
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function summaryFor(rows: EventRow[]) {
  return {
    totalEvents: rows.length,
    errorCount: rows.filter((row) => ["error", "critical"].includes(String(row.severity))).length,
    warningCount: rows.filter((row) => row.severity === "warning").length,
    infoCount: rows.filter((row) => row.severity === "info").length,
    noResultCount: rows.filter((row) => row.no_results_reason || ["no_restaurant_results", "no_activity_results", "no_results"].includes(String(row.event_type))).length,
    noPairCount: rows.filter((row) => row.no_pairs_reason || row.event_type === "no_valid_pairs").length,
    lowPairCount: rows.filter((row) => row.event_type === "low_pair_count").length,
    slowCount: rows.filter((row) => row.event_type === "slow_search" || Number(row.timing_ms ?? 0) > 3000 || ["slow", "degraded"].includes(String(row.speed_status))).length,
    unresolvedCount: rows.filter((row) => ["new", "reviewing"].includes(String(row.review_status))).length,
    publicEventCount: rows.filter((row) => String(row.source).startsWith("public_") || row.source === "search_api").length,
    searchLabEventCount: rows.filter((row) => row.source === "admin_search_lab").length,
    betaTesterEventCount: rows.filter((row) => row.source === "beta_tester_search" || row.beta_tester_id).length,
  };
}

function table(title: string, rows: { value: string; count: number }[]) {
  if (!rows.length) return `<h2>${escapeHtml(title)}</h2><p>No data.</p>`;
  return `<h2>${escapeHtml(title)}</h2><table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse">${rows.map((row) => `<tr><td style="border-bottom:1px solid #eee">${escapeHtml(row.value)}</td><td style="border-bottom:1px solid #eee;text-align:right"><b>${row.count}</b></td></tr>`).join("")}</table>`;
}

function buildEmail(rows: EventRow[], hours: number, summary: ReturnType<typeof summaryFor>) {
  const dashboardUrl = `${siteUrl()}/admin/dashboard/search-health`;
  const topEventTypes = countBy(rows, "event_type");
  const topNoPairReasons = countBy(rows, "no_pairs_reason");
  const failingQueries = commonFailingQueries(rows);
  const slowest = [...rows].filter((row) => row.timing_ms != null).sort((a, b) => Number(b.timing_ms ?? 0) - Number(a.timing_ms ?? 0)).slice(0, 5);
  const recent = rows.filter((row) => ["warning", "error", "critical"].includes(String(row.severity))).slice(0, 10);
  const cards = [
    ["Total Events", summary.totalEvents], ["Errors", summary.errorCount], ["Warnings", summary.warningCount], ["No Valid Pairs", summary.noPairCount], ["No Results", summary.noResultCount], ["Slow Searches", summary.slowCount], ["Unresolved", summary.unresolvedCount],
  ];
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;color:#211815;line-height:1.5">
    <h1>TheOutHaven Search Health Digest</h1>
    <p>Last ${hours} hours</p>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">${cards.map(([label, value]) => `<div style="border:1px solid #eee;border-radius:14px;padding:12px"><div style="font-size:12px;color:#765">${label}</div><div style="font-size:24px;font-weight:800">${value}</div></div>`).join("")}</div>
    ${table("Top Event Types", topEventTypes)}
    ${table("Top No-Pair Reasons", topNoPairReasons)}
    <h2>Common Failing Queries</h2>${failingQueries.length ? `<ul>${failingQueries.map((row) => `<li>${escapeHtml(row.query)} <b>(${row.count})</b></li>`).join("")}</ul>` : "<p>No repeated failing queries.</p>"}
    <h2>Slowest Searches</h2>${slowest.length ? `<ul>${slowest.map((row) => `<li>${escapeHtml(row.raw_query || "—")} — <b>${escapeHtml(row.timing_ms)}ms</b> · ${escapeHtml(row.source)}</li>`).join("")}</ul>` : "<p>No timed searches.</p>"}
    <h2>Recent Events</h2>${recent.length ? recent.map((row) => `<div style="border-top:1px solid #eee;padding:10px 0"><b>${escapeHtml(row.event_label || row.event_type)}</b> · ${escapeHtml(row.severity)}<br/>${escapeHtml(row.raw_query || "—")}<br/><small>${escapeHtml(row.source)} · pairs ${escapeHtml(row.pair_count)} · restaurants ${escapeHtml(row.restaurant_count)} · activities ${escapeHtml(row.activity_count)} · ${escapeHtml(row.timing_ms)}ms · ${escapeHtml(row.created_at)}</small></div>`).join("") : "<p>No recent warnings or errors.</p>"}
    <p><a href="${dashboardUrl}" style="display:inline-block;background:#e11d48;color:white;padding:12px 16px;border-radius:12px;text-decoration:none;font-weight:800">Open Search Health Dashboard</a></p>
  </div>`;
  const text = `TheOutHaven Search Health Digest\nLast ${hours} hours\n${JSON.stringify(summary, null, 2)}\nDashboard: ${dashboardUrl}`;
  return { html, text };
}

async function sendEmail(to: string[], subject: string, html: string, text: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("SEARCH_HEALTH_DIGEST_FROM") || Deno.env.get("EMAIL_FROM") || "no-reply@theouthaven.com";
  if (!apiKey) return { sent: false, skipped: true, reason: "RESEND_API_KEY missing" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message ?? response.statusText);
  return { sent: true, id: data?.id ?? null };
}

async function recordRun(supabase: any, row: Record<string, unknown>) {
  try {
    await supabase.from("search_health_digest_runs").insert(row);
  } catch {
    // Optional table may not exist in older deployments.
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (!validCronSecret(req)) return unauthorized("Invalid cron secret");

  const supabase = createSupabaseAdminClient();
  const body = await req.json().catch(() => ({}));
  const hours = Math.min(Math.max(Number(body.hours ?? 24), 1), 168);
  const force = body.force === true;
  const source = String(body.source || "cron");
  const since = new Date(Date.now() - hours * 3600000).toISOString();

  try {
    const { data, error } = await supabase
      .from("search_health_events")
      .select("id,created_at,source,raw_query,event_type,severity,event_label,restaurant_count,activity_count,pair_count,no_results_reason,no_pairs_reason,timing_ms,speed_status,review_status,beta_tester_id")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    const rows = data ?? [];
    const summary = summaryFor(rows);
    if (!rows.length && !force) {
      const response = { success: true, sent: false, reason: "no_search_health_events", hours, summary };
      await recordRun(supabase, { source, sent: false, recipient_count: 0, total_events: 0, error_count: 0, warning_count: 0, no_pair_count: 0, no_result_count: 0, slow_count: 0, response });
      return ok(response);
    }
    const to = recipients();
    if (!to.length) throw new Error("SEARCH_HEALTH_DIGEST_TO is not configured");
    const issueCount = summary.warningCount + summary.errorCount;
    const subject = issueCount > 0 ? `TheOutHaven Search Health Digest: ${issueCount} issues in last ${hours}h` : "TheOutHaven Search Health Digest: No issues found";
    const email = buildEmail(rows, hours, summary);
    const emailResponse = await sendEmail(to, subject, email.html, email.text);
    const response = { success: true, sent: true, recipients: to, hours, summary, email: emailResponse };
    await recordRun(supabase, { source, sent: true, recipient_count: to.length, total_events: summary.totalEvents, error_count: summary.errorCount, warning_count: summary.warningCount, no_pair_count: summary.noPairCount, no_result_count: summary.noResultCount, slow_count: summary.slowCount, response });
    return ok(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search Health digest failed";
    const response = { success: false, error: message };
    await recordRun(supabase, { source, sent: false, recipient_count: 0, response });
    return serverError("Search Health digest failed", message);
  }
});
