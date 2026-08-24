import { handleOptions } from "../_shared/cors.ts";
import { jsonResponse, ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logCronJobRun } from "../_shared/cronLogger.ts";
import { sendEmail } from "../_shared/email.ts";

type Row = Record<string, any>;
type WindowStats = {
  label: string;
  searches: number;
  previousSearches: number;
  changePct: number | null;
  issues: number;
  noResults: number;
  noPairs: number;
  slow: number;
  failed: number;
  partial: number;
  fallback: number;
};

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

const CREATE_SOURCE = "public_create_search";
const CREATE_ROUTE = "/api/generate";
const SLOW_MS = 5000;
const JOB_NAME = "admin-search-health-digest";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function siteUrl() {
  return (Deno.env.get("NEXT_PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://theouthaven.com").replace(/\/$/, "");
}

function recipients() {
  return (Deno.env.get("SEARCH_HEALTH_DIGEST_TO") || Deno.env.get("ADMIN_EMAIL") || Deno.env.get("SUPERADMIN_EMAIL") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function cronSecretMatches(req: Request) {
  const expected = Deno.env.get("CRON_SECRET");
  return Boolean(expected) && req.headers.get("x-cron-secret") === expected;
}

function easternParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

function isEasternDigestTime(date = new Date()) {
  const parts = easternParts(date);
  return parts.hour === 6 && parts.minute >= 25 && parts.minute <= 40;
}

function formatEastern(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function pct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function pctLabel(value: number | null) {
  if (value == null) return "No prior baseline";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function rate(count: number, searches: number) {
  if (!searches) return "0%";
  return `${Math.round((count / searches) * 1000) / 10}%`;
}

function createQuery(supabase: any, head = false) {
  return supabase
    .from("search_events")
    .select(head ? "id" : "*", head ? { count: "exact", head: true } : undefined)
    .eq("source", CREATE_SOURCE)
    .eq("route", CREATE_ROUTE);
}

async function exactCount(supabase: any, from?: string, to?: string, mutate?: (query: any) => any) {
  let query = createQuery(supabase, true);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lt("created_at", to);
  if (mutate) query = mutate(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function fallbackFilter(query: any) {
  return query.or("v2_fallback_outcome.not.is.null,metadata->debugParity->>legacyFallbackUsed.eq.true,metadata->>fallback_used.eq.true");
}

function partialFilter(query: any) {
  return query.eq("metadata->>partialResults", "true");
}

async function statsForWindow(supabase: any, label: string, days: number): Promise<WindowStats> {
  const now = Date.now();
  const currentFrom = new Date(now - days * 86400000).toISOString();
  const currentTo = new Date(now).toISOString();
  const previousFrom = new Date(now - days * 2 * 86400000).toISOString();
  const previousTo = currentFrom;

  const [searches, previousSearches, issues, noResults, noPairs, slow, failed, partial, fallback] = await Promise.all([
    exactCount(supabase, currentFrom, currentTo),
    exactCount(supabase, previousFrom, previousTo),
    exactCount(supabase, currentFrom, currentTo, (q) => q.eq("had_issue", true)),
    exactCount(supabase, currentFrom, currentTo, (q) => q.or("no_results_reason.not.is.null,issue_type.eq.no_results,result_count.eq.0")),
    exactCount(supabase, currentFrom, currentTo, (q) => q.or("no_pairs_reason.not.is.null,issue_type.eq.no_valid_pairs")),
    exactCount(supabase, currentFrom, currentTo, (q) => q.or(`timing_ms.gt.${SLOW_MS},speed_status.in.(degraded,critical,timeout,failed,slow)`)),
    exactCount(supabase, currentFrom, currentTo, (q) => q.eq("success", false)),
    exactCount(supabase, currentFrom, currentTo, partialFilter),
    exactCount(supabase, currentFrom, currentTo, fallbackFilter),
  ]);

  return { label, searches, previousSearches, changePct: pct(searches, previousSearches), issues, noResults, noPairs, slow, failed, partial, fallback };
}

async function recentCreateSearches24h(supabase: any) {
  const since = new Date(Date.now() - 86400000).toISOString();
  const { data, error } = await createQuery(supabase)
    .select("id,created_at,raw_query,normalized_query,search_type,primary_domain,restaurant_count,activity_count,pair_count,result_count,wants_pairing,timing_ms,speed_status,success,had_issue,issue_type,issue_label,no_results_reason,no_pairs_reason,search_core_version,v2_fallback_outcome,metadata")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data ?? [];
}

function isNoResult(row: Row) {
  return Boolean(row.no_results_reason) || row.issue_type === "no_results" || Number(row.result_count ?? 0) === 0;
}

function isNoPair(row: Row) {
  return Boolean(row.no_pairs_reason) || row.issue_type === "no_valid_pairs" || (row.wants_pairing === true && Number(row.pair_count ?? 0) === 0);
}

function isSlow(row: Row) {
  return Number(row.timing_ms ?? 0) > SLOW_MS || ["degraded", "critical", "timeout", "failed", "slow"].includes(String(row.speed_status ?? "").toLowerCase());
}

function isPartial(row: Row) {
  return row?.metadata?.partialResults === true || row?.metadata?.requestFulfilled === false;
}

function isFallback(row: Row) {
  return Boolean(
    row.v2_fallback_outcome ||
      row?.metadata?.fallback_used === true ||
      row?.metadata?.debugParity?.legacyFallbackUsed === true,
  );
}

function issueReason(row: Row) {
  if (row.no_results_reason) return String(row.no_results_reason);
  if (row.no_pairs_reason) return String(row.no_pairs_reason);
  if (row.v2_fallback_outcome) return `fallback: ${row.v2_fallback_outcome}`;
  if (isPartial(row)) return "partial fulfillment";
  if (isSlow(row)) return "slow search";
  if (row.issue_label) return String(row.issue_label);
  if (row.issue_type) return String(row.issue_type);
  if (row.success === false) return "search_failed";
  return "review required";
}

function actionRows(rows: Row[]) {
  return rows.filter((row) => row.success === false || row.had_issue === true || isNoResult(row) || isNoPair(row) || isSlow(row) || isPartial(row) || isFallback(row));
}

function groupActions(rows: Row[]) {
  const map = new Map<string, { query: string; reason: string; count: number; last: string; timing: number; results: number }>();
  for (const row of actionRows(rows)) {
    const query = String(row.raw_query || row.normalized_query || "").trim();
    if (!query) continue;
    const reason = issueReason(row);
    const key = `${query.toLowerCase()}|${reason}`;
    const created = String(row.created_at ?? "");
    const current = map.get(key) ?? { query, reason, count: 0, last: created, timing: 0, results: 0 };
    current.count += 1;
    if (created > current.last) current.last = created;
    current.timing = Math.max(current.timing, Number(row.timing_ms ?? 0));
    current.results = Math.max(current.results, Number(row.result_count ?? 0));
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, 20);
}

function topReasons(rows: Row[]) {
  const map = new Map<string, number>();
  for (const row of actionRows(rows)) {
    const reason = issueReason(row);
    map.set(reason, (map.get(reason) ?? 0) + 1);
  }
  return [...map.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

function percentile95(rows: Row[]) {
  const values = rows.map((row) => Number(row.timing_ms)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.floor(values.length * 0.95))];
}

function statCard(label: string, value: string | number, helper: string, tone = BRAND.text) {
  return `<td width="33.33%" valign="top" style="padding:6px"><div style="background:${BRAND.elevated};border:1px solid ${BRAND.border};border-radius:14px;padding:16px;min-height:92px"><div style="font-size:11px;color:${BRAND.subtle};font-weight:800;text-transform:uppercase;letter-spacing:.06em">${escapeHtml(label)}</div><div style="margin-top:5px;font-size:25px;line-height:30px;color:${tone};font-weight:850">${escapeHtml(value)}</div><div style="margin-top:4px;font-size:12px;line-height:18px;color:${BRAND.muted}">${escapeHtml(helper)}</div></div></td>`;
}

function trendRow(stats: WindowStats, comparison: string) {
  const tone = stats.changePct != null && stats.changePct < 0 ? BRAND.amber : BRAND.green;
  return `<tr><td style="padding:12px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-weight:800">${escapeHtml(stats.label)}</td><td align="right" style="padding:12px 8px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-weight:850">${stats.searches}</td><td align="right" style="padding:12px 8px;border-bottom:1px solid ${BRAND.border};color:${tone};font-weight:800">${escapeHtml(pctLabel(stats.changePct))}</td><td align="right" style="padding:12px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted}">${escapeHtml(comparison)}</td></tr>`;
}

function actionList(groups: ReturnType<typeof groupActions>) {
  if (!groups.length) return `<div style="padding:16px;border:1px solid ${BRAND.border};background:${BRAND.elevated};border-radius:14px;color:${BRAND.green};font-size:14px;font-weight:750">No failed, degraded, fallback, partial, no-result, or no-pair /create searches were recorded in the last 24 hours.</div>`;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${groups.map((item) => `<tr><td valign="top" style="padding:12px 0;border-bottom:1px solid ${BRAND.border}"><div style="color:${BRAND.text};font-size:13px;font-weight:800">${escapeHtml(item.query)}</div><div style="margin-top:4px;color:${BRAND.muted};font-size:11px">${escapeHtml(item.reason)} · last ${escapeHtml(formatEastern(item.last))} · ${item.results} results</div></td><td valign="top" align="right" style="padding:12px 0;border-bottom:1px solid ${BRAND.border}"><div style="color:${BRAND.red};font-size:14px;font-weight:850">${item.count}×</div><div style="color:${BRAND.subtle};font-size:11px">${Math.round(item.timing)}ms max</div></td></tr>`).join("")}</table>`;
}

function reasonList(reasons: ReturnType<typeof topReasons>) {
  if (!reasons.length) return `<div style="color:${BRAND.green};font-size:13px;font-weight:750">No problem patterns in the last 24 hours.</div>`;
  return reasons.map((item) => `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid ${BRAND.border}"><span style="color:${BRAND.muted};font-size:12px">${escapeHtml(item.reason)}</span><b style="color:${BRAND.text};font-size:12px">${item.count}</b></div>`).join("");
}

function buildEmail(input: { total: number; day: WindowStats; week: WindowStats; month: WindowStats; rows24: Row[] }) {
  const { total, day, week, month, rows24 } = input;
  const groups = groupActions(rows24);
  const reasons = topReasons(rows24);
  const p95 = percentile95(rows24);
  const cleanSuccess = Math.max(day.searches - new Set(actionRows(rows24).map((row) => row.id)).size, 0);
  const cleanSuccessRate = day.searches ? Math.round((cleanSuccess / day.searches) * 1000) / 10 : 0;
  const dashboardUrl = `${siteUrl()}/admin/dashboard/search-health`;
  const statusGood = groups.length === 0;
  const headline = statusGood ? "Search is operating normally" : "Search issues need review today";

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><style>@media(max-width:620px){.shell{width:100%!important}.pad{padding-left:20px!important;padding-right:20px!important}.stats td{display:block!important;width:100%!important}}</style></head><body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${BRAND.text}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.bg}"><tr><td align="center" style="padding:28px 12px"><table class="shell" role="presentation" width="700" cellspacing="0" cellpadding="0" style="width:700px;max-width:700px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:20px;overflow:hidden"><tr><td class="pad" style="padding:24px 32px;border-bottom:1px solid ${BRAND.border}"><table width="100%"><tr><td width="48"><img src="https://theouthaven.com/toh_logo.png" width="40" height="40" alt="TheOutHaven" style="display:block;border:0"></td><td style="color:${BRAND.text};font-size:16px;font-weight:850">TheOutHaven<br><span style="color:${BRAND.subtle};font-size:12px;font-weight:650">Daily Search Operations Brief</span></td><td align="right"><span style="display:inline-block;padding:7px 11px;border-radius:999px;background:${statusGood ? "#17351f" : "rgba(225,6,42,.14)"};color:${statusGood ? BRAND.green : BRAND.red};font-size:11px;font-weight:850">${statusGood ? "HEALTHY" : "ACTION NEEDED"}</span></td></tr></table></td></tr><tr><td class="pad" style="padding:30px 32px 10px"><h1 style="margin:0;color:${BRAND.text};font-size:28px;line-height:34px">${escapeHtml(headline)}</h1><p style="margin:9px 0 0;color:${BRAND.muted};font-size:14px;line-height:22px">High-level production search KPIs plus only the last 24 hours of searches the admin team may need to investigate or fix.</p><p style="margin:7px 0 0;color:${BRAND.subtle};font-size:12px">Generated ${escapeHtml(formatEastern(new Date().toISOString()))}</p></td></tr><tr><td class="pad" style="padding:14px 26px 8px"><div style="padding:0 6px 8px;color:${BRAND.text};font-size:18px;font-weight:850">High-level search stats</div><table class="stats" width="100%" cellspacing="0" cellpadding="0"><tr>${statCard("Total searches", total, "All recorded production /create searches", BRAND.blue)}${statCard("Last 24 hours", day.searches, `${pctLabel(day.changePct)} day over day`)}${statCard("Last 7 days", week.searches, `${pctLabel(week.changePct)} week over week`)}</tr><tr>${statCard("Last 30 days", month.searches, `${pctLabel(month.changePct)} month over month`)}${statCard("Clean success rate", `${cleanSuccessRate}%`, `${cleanSuccess} clean searches in the last 24h`, cleanSuccessRate >= 95 ? BRAND.green : BRAND.amber)}${statCard("P95 latency", p95 == null ? "—" : `${Math.round(p95)}ms`, "Last 24 hours", p95 != null && p95 > SLOW_MS ? BRAND.amber : BRAND.green)}</tr></table></td></tr><tr><td class="pad" style="padding:24px 32px 8px"><div style="color:${BRAND.text};font-size:18px;font-weight:850">Volume trend</div><table width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:8px 0;color:${BRAND.subtle};font-size:10px;font-weight:800">WINDOW</td><td align="right" style="padding:8px;color:${BRAND.subtle};font-size:10px;font-weight:800">SEARCHES</td><td align="right" style="padding:8px;color:${BRAND.subtle};font-size:10px;font-weight:800">CHANGE</td><td align="right" style="padding:8px 0;color:${BRAND.subtle};font-size:10px;font-weight:800">QUALITY</td></tr>${trendRow(day, `${rate(day.issues, day.searches)} issue rate`)}${trendRow(week, `${rate(week.issues, week.searches)} issue rate`)}${trendRow(month, `${rate(month.issues, month.searches)} issue rate`)}</table></td></tr><tr><td class="pad" style="padding:24px 26px 8px"><div style="padding:0 6px 8px;color:${BRAND.text};font-size:18px;font-weight:850">Last 24 hours · quality KPIs</div><table class="stats" width="100%" cellspacing="0" cellpadding="0"><tr>${statCard("No results", day.noResults, `${rate(day.noResults, day.searches)} of searches`, day.noResults ? BRAND.red : BRAND.green)}${statCard("No valid pairs", day.noPairs, `${rate(day.noPairs, day.searches)} of searches`, day.noPairs ? BRAND.amber : BRAND.green)}${statCard("Hard failures", day.failed, `${rate(day.failed, day.searches)} of searches`, day.failed ? BRAND.red : BRAND.green)}</tr><tr>${statCard("Fallback / recovery", day.fallback, `${rate(day.fallback, day.searches)} potential quality signal`, day.fallback ? BRAND.amber : BRAND.green)}${statCard("Partial results", day.partial, `${rate(day.partial, day.searches)} of searches`, day.partial ? BRAND.amber : BRAND.green)}${statCard("Slow searches", day.slow, `>${SLOW_MS / 1000}s or degraded`, day.slow ? BRAND.amber : BRAND.green)}</tr></table></td></tr><tr><td class="pad" style="padding:24px 32px 8px"><div style="color:${BRAND.text};font-size:18px;font-weight:850">Today’s remediation queue · last 24 hours only</div><p style="margin:5px 0 12px;color:${BRAND.muted};font-size:13px">These are the actual recent queries worth reviewing. Older failed searches are intentionally excluded.</p>${actionList(groups)}</td></tr><tr><td class="pad" style="padding:24px 32px 8px"><div style="color:${BRAND.text};font-size:16px;font-weight:850">Top issue patterns · last 24 hours</div><div style="margin-top:8px">${reasonList(reasons)}</div></td></tr><tr><td class="pad" style="padding:28px 32px 32px"><a href="${dashboardUrl}" style="display:inline-block;background:${BRAND.red};color:#fff;padding:13px 18px;border-radius:12px;text-decoration:none;font-weight:850;font-size:13px">Open Search Health Dashboard</a></td></tr><tr><td class="pad" style="padding:20px 32px 24px;border-top:1px solid ${BRAND.border};background:#100d0c;color:${BRAND.subtle};font-size:11px;line-height:17px">TheOutHaven.com · Production /create telemetry · Daily delivery at 6:30 AM America/New_York.</td></tr></table></td></tr></table></body></html>`;

  const text = [
    "TheOutHaven Daily Search Operations Brief",
    headline,
    "",
    `Total searches: ${total}`,
    `24h: ${day.searches} (${pctLabel(day.changePct)} DoD)`,
    `7d: ${week.searches} (${pctLabel(week.changePct)} WoW)`,
    `30d: ${month.searches} (${pctLabel(month.changePct)} MoM)`,
    `Clean success rate: ${cleanSuccessRate}%`,
    `P95 latency: ${p95 == null ? "—" : Math.round(p95) + "ms"}`,
    "",
    `No results: ${day.noResults}`,
    `No valid pairs: ${day.noPairs}`,
    `Hard failures: ${day.failed}`,
    `Fallback/recovery: ${day.fallback}`,
    `Partial results: ${day.partial}`,
    `Slow: ${day.slow}`,
    "",
    "Last 24 hours remediation queue:",
    ...(groups.length ? groups.map((item) => `- ${item.query} — ${item.reason} — ${item.count}x — last ${formatEastern(item.last)}`) : ["- None"]),
    "",
    `Dashboard: ${dashboardUrl}`,
  ].join("\n");

  return { html, text, groups, reasons, p95, cleanSuccessRate };
}

async function recordDigestRun(supabase: any, payload: Record<string, unknown>) {
  try {
    await supabase.from("search_health_digest_runs").insert(payload);
  } catch (error) {
    console.warn("[admin-search-health-digest] digest run log skipped", error);
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const supabase = createSupabaseAdminClient();

  try {
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;
    const source = String(body.source || "cron");

    if (!cronSecretMatches(req)) return jsonResponse({ success: false, error: "Unauthorized" }, 401);

    if (source === "cron" && !force && !isEasternDigestTime()) {
      await logCronJobRun(supabase, {
        job_name: JOB_NAME,
        function_name: JOB_NAME,
        route_path: "supabase/functions/admin-search-health-digest",
        description: "Emails admins the daily production /create search operations brief.",
        schedule_hint: "6:30 AM America/New_York",
        source,
        status: "skipped",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedMs,
        skipped_count: 1,
        details: { reason: "not_0630_eastern", eastern_time: easternParts() },
      });
      return ok({ success: true, sent: false, skipped: true, reason: "not_0630_eastern", eastern: easternParts() });
    }

    const [total, day, week, month, rows24] = await Promise.all([
      exactCount(supabase),
      statsForWindow(supabase, "Last 24 hours", 1),
      statsForWindow(supabase, "Last 7 days", 7),
      statsForWindow(supabase, "Last 30 days", 30),
      recentCreateSearches24h(supabase),
    ]);

    const email = buildEmail({ total, day, week, month, rows24 });
    const to = recipients();
    if (!to.length) throw new Error("No search health digest recipient configured");

    const subject = `TheOutHaven Search Ops — ${day.searches} searches · ${email.groups.length} issues to review`;
    const emailResult = await sendEmail({
      to,
      subject,
      html: email.html,
      text: email.text,
      senderKey: "admin",
    });

    const summary = {
      total_searches: total,
      searches_24h: day.searches,
      searches_7d: week.searches,
      searches_30d: month.searches,
      day_over_day_pct: day.changePct,
      week_over_week_pct: week.changePct,
      month_over_month_pct: month.changePct,
      clean_success_rate_24h: email.cleanSuccessRate,
      no_results_24h: day.noResults,
      no_pairs_24h: day.noPairs,
      failed_24h: day.failed,
      fallback_24h: day.fallback,
      partial_24h: day.partial,
      slow_24h: day.slow,
      p95_latency_ms_24h: email.p95,
      remediation_groups_24h: email.groups.length,
    };

    await recordDigestRun(supabase, {
      source,
      sent: Boolean((emailResult as any)?.sent),
      recipient_count: to.length,
      total_events: day.searches,
      error_count: day.failed,
      warning_count: day.issues,
      no_pair_count: day.noPairs,
      no_result_count: day.noResults,
      slow_count: day.slow,
      response: { summary, email: emailResult },
    });

    await logCronJobRun(supabase, {
      job_name: JOB_NAME,
      function_name: JOB_NAME,
      route_path: "supabase/functions/admin-search-health-digest",
      description: "Emails admins the daily production /create search operations brief.",
      schedule_hint: "6:30 AM America/New_York",
      source,
      status: "success",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedMs,
      checked_count: day.searches,
      success_count: Math.max(day.searches - day.failed, 0),
      failed_count: day.failed,
      details: summary,
      metadata: { emailResult },
    });

    return ok({ success: true, sent: Boolean((emailResult as any)?.sent), summary, comparisons: { day, week, month }, email: emailResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logCronJobRun(supabase, {
      job_name: JOB_NAME,
      function_name: JOB_NAME,
      route_path: "supabase/functions/admin-search-health-digest",
      description: "Emails admins the daily production /create search operations brief.",
      schedule_hint: "6:30 AM America/New_York",
      source: "cron",
      status: "failed",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedMs,
      failed_count: 1,
      error_message: message,
    });
    return serverError("admin-search-health-digest failed", message);
  }
});