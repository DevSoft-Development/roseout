import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logCronJobRun } from "../_shared/cronLogger.ts";
import { sendEmail } from "../_shared/email.ts";

type Row = Record<string, any>;
const JOB_NAME = "admin-platform-error-digest";
const BRAND = {
  bg: "#090706", card: "#141010", elevated: "#1c1614", border: "rgba(255,255,255,0.12)",
  text: "#fff7f2", muted: "#b8aaa3", subtle: "#8f817a", red: "#e1062a", green: "#70df8b", amber: "#f5c76b", blue: "#8fb8ff",
};
const severityRank: Record<string, number> = { info: 0, warning: 1, error: 2, critical: 3 };

function esc(value: unknown) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function siteUrl() { return (Deno.env.get("NEXT_PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://theouthaven.com").replace(/\/$/, ""); }
function recipients() {
  return (Deno.env.get("PLATFORM_ERROR_DIGEST_TO") || Deno.env.get("ADMIN_EMAIL") || Deno.env.get("SUPERADMIN_EMAIL") || "").split(",").map((v) => v.trim()).filter(Boolean);
}
function cronSecretMatches(req: Request) { const expected = Deno.env.get("CRON_SECRET"); return Boolean(expected) && req.headers.get("x-cron-secret") === expected; }
function easternParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { hour: Number(value("hour")), minute: Number(value("minute")) };
}
function isEasternDigestTime(date = new Date()) { const p = easternParts(date); return p.hour === 6 && p.minute >= 10 && p.minute <= 25; }
function pct(current: number, previous: number) { if (!previous) return current ? null : 0; return Math.round(((current - previous) / previous) * 1000) / 10; }
function pctLabel(value: number | null) { if (value == null) return "new / no baseline"; if (value === 0) return "flat"; return `${value > 0 ? "+" : ""}${value}%`; }
function metric(label: string, value: string | number, helper: string, tone = BRAND.text) {
  return `<td width="33.33%" valign="top" style="padding:6px"><div style="background:${BRAND.elevated};border:1px solid ${BRAND.border};border-radius:14px;padding:15px;min-height:88px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:${BRAND.subtle};font-weight:850">${esc(label)}</div><div style="font-size:24px;line-height:30px;color:${tone};font-weight:900;margin-top:5px">${esc(value)}</div><div style="font-size:11px;line-height:17px;color:${BRAND.muted};margin-top:3px">${esc(helper)}</div></div></td>`;
}
function section(title: string, body: string) { return `<div style="margin-top:22px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${BRAND.red};font-weight:900;margin-bottom:10px">${esc(title)}</div><div style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:18px;padding:18px">${body}</div></div>`; }
function formatEastern(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}
function toneForSeverity(value: string) { return value === "critical" ? BRAND.red : value === "error" ? BRAND.amber : BRAND.blue; }

async function countErrors(supabase: any, from: string, to: string) {
  const { count, error } = await supabase.from("platform_error_events").select("id", { count: "exact", head: true }).gte("occurred_at", from).lt("occurred_at", to);
  if (error) throw error;
  return count ?? 0;
}
async function recentErrors(supabase: any) {
  const since = new Date(Date.now() - 86400000).toISOString();
  const { data, error } = await supabase.from("platform_error_events")
    .select("id,occurred_at,environment,error_type,severity,message,user_visible,route,source,status_code,request_id,fingerprint,metadata")
    .gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return data ?? [];
}
function groupIncidents(rows: Row[]) {
  const map = new Map<string, { fingerprint: string; message: string; type: string; severity: string; route: string; count: number; visible: number; last: string }>();
  for (const row of rows) {
    const key = String(row.fingerprint || `${row.error_type}|${row.route || "unknown"}|${row.message}`).slice(0, 1000);
    const current = map.get(key) || { fingerprint: key, message: String(row.message || "Unknown error"), type: String(row.error_type || "error"), severity: String(row.severity || "error"), route: String(row.route || "Unknown route"), count: 0, visible: 0, last: String(row.occurred_at || "") };
    current.count += 1;
    if (row.user_visible === true) current.visible += 1;
    if ((severityRank[String(row.severity)] ?? 2) > (severityRank[current.severity] ?? 2)) current.severity = String(row.severity);
    if (String(row.occurred_at || "") > current.last) current.last = String(row.occurred_at);
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => (severityRank[b.severity] ?? 2) - (severityRank[a.severity] ?? 2) || b.count - a.count || b.last.localeCompare(a.last));
}
function incidentTable(items: ReturnType<typeof groupIncidents>) {
  if (!items.length) return `<div style="color:${BRAND.green};font-size:13px;font-weight:800">No production platform errors were recorded in the last 24 hours.</div>`;
  return `<table width="100%" cellspacing="0" cellpadding="0">${items.slice(0, 20).map((item) => `<tr><td style="padding:12px 0;border-bottom:1px solid ${BRAND.border}"><div style="font-size:10px;text-transform:uppercase;color:${toneForSeverity(item.severity)};font-weight:900">${esc(item.severity)} · ${esc(item.type)}</div><div style="margin-top:4px;color:${BRAND.text};font-size:13px;font-weight:800;line-height:19px">${esc(item.message)}</div><div style="margin-top:4px;color:${BRAND.subtle};font-size:11px">${esc(item.route)} · Last ${esc(formatEastern(item.last))}</div></td><td align="right" valign="top" style="padding:12px 0;border-bottom:1px solid ${BRAND.border}"><div style="color:${BRAND.text};font-size:17px;font-weight:900">${item.count}×</div><div style="color:${BRAND.muted};font-size:10px">${item.visible} user-visible</div></td></tr>`).join("")}</table>`;
}
function routeTable(rows: Row[]) {
  const map = new Map<string, number>();
  for (const row of rows) map.set(String(row.route || "Unknown route"), (map.get(String(row.route || "Unknown route")) || 0) + 1);
  const items = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0,10);
  if (!items.length) return `<div style="color:${BRAND.muted};font-size:13px">No affected routes.</div>`;
  return items.map(([route,count]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid ${BRAND.border}"><span style="color:${BRAND.text};font-size:12px;font-weight:800">${esc(route)}</span><span style="color:${BRAND.muted};font-size:12px;font-weight:850">${count}</span></div>`).join("");
}

function buildDigest(rows: Row[], previous24: number) {
  const incidents = groupIncidents(rows);
  const visible = rows.filter((r) => r.user_visible === true).length;
  const critical = rows.filter((r) => r.severity === "critical").length;
  const server = rows.filter((r) => String(r.error_type || "").startsWith("next_")).length;
  const client = rows.filter((r) => ["client_runtime_error","unhandled_promise_rejection","user_visible_error_message"].includes(String(r.error_type))).length;
  const affectedRoutes = new Set(rows.map((r) => String(r.route || "")).filter(Boolean)).size;
  const change = pct(rows.length, previous24);
  const html = `<!doctype html><html><body style="margin:0;background:${BRAND.bg};font-family:Arial,Helvetica,sans-serif;color:${BRAND.text}"><table role="presentation" width="100%" style="background:${BRAND.bg};padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:720px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:26px;overflow:hidden"><tr><td style="padding:30px;background:linear-gradient(135deg,#141010,#1c1614 60%,#2a0d13);border-bottom:1px solid ${BRAND.border}"><div style="font-size:22px;font-weight:900">TheOutHaven</div><div style="margin-top:7px;color:${BRAND.muted};font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:900">Platform Error Digest</div><h1 style="font-size:30px;line-height:36px;margin:18px 0 6px">Production reliability at a glance</h1><div style="color:${BRAND.muted};font-size:14px;line-height:21px">True application failures, user-visible error messages, route/render failures and client exceptions from the last 24 hours. Search-quality issues remain in Search Health.</div></td></tr><tr><td style="padding:24px"><table role="presentation" width="100%"><tr>${metric("Errors", rows.length, `Last 24h · ${pctLabel(change)} DoD`, rows.length ? BRAND.amber : BRAND.green)}${metric("User-visible", visible, "Errors actually displayed to users", visible ? BRAND.red : BRAND.green)}${metric("Critical", critical, "Immediate-attention severity", critical ? BRAND.red : BRAND.green)}</tr><tr>${metric("Unique incidents", incidents.length, "Duplicate errors grouped")}${metric("Affected routes", affectedRoutes, "Distinct routes/features")}${metric("Server / Client", `${server} / ${client}`, "Framework vs browser-side")}</tr></table>${section("Top Incidents — Last 24 Hours", incidentTable(incidents))}${section("Most Affected Routes", routeTable(rows))}<div style="margin-top:24px;text-align:center"><a href="${esc(siteUrl())}/admin/dashboard/platform-errors" style="display:inline-block;background:${BRAND.red};color:white;text-decoration:none;font-weight:850;padding:13px 20px;border-radius:999px">Open Platform Error Operations</a></div></td></tr></table><div style="max-width:720px;color:${BRAND.subtle};font-size:11px;line-height:17px;text-align:center;margin-top:14px">TheOutHaven.com · Platform Error Digest · 6:15 AM Eastern</div></td></tr></table></body></html>`;
  return { html, summary: { errors_24h: rows.length, previous_24h: previous24, dod_pct: change, user_visible_24h: visible, critical_24h: critical, unique_incidents_24h: incidents.length, affected_routes_24h: affectedRoutes, server_errors_24h: server, client_errors_24h: client } };
}

async function sendCritical(supabase: any, eventId: string, to: string[]) {
  const { data, error } = await supabase.from("platform_error_events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!data) return ok({ success: false, error: "event_not_found" }, { status: 404 });
  const html = `<!doctype html><html><body style="margin:0;background:${BRAND.bg};font-family:Arial,Helvetica,sans-serif;color:${BRAND.text};padding:28px"><div style="max-width:680px;margin:auto;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:22px;padding:26px"><div style="color:${BRAND.red};font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.12em">Critical Production Error</div><h1 style="font-size:26px">${esc(data.message)}</h1><p style="color:${BRAND.muted}">${esc(data.route || "Unknown route")} · ${esc(formatEastern(data.occurred_at))}</p><p style="color:${BRAND.text};font-size:13px">Type: ${esc(data.error_type)} · Source: ${esc(data.source || "unknown")}</p><a href="${esc(siteUrl())}/admin/dashboard/platform-errors" style="display:inline-block;margin-top:18px;background:${BRAND.red};color:white;text-decoration:none;font-weight:850;padding:12px 18px;border-radius:999px">Investigate Error</a></div></body></html>`;
  const email = await sendEmail({ to, senderKey: "admin", subject: `CRITICAL · TheOutHaven platform error · ${String(data.route || "unknown route")}`, html });
  return ok({ success: email?.sent === true, email });
}

Deno.serve(async (req: Request) => {
  const options = handleOptions(req); if (options) return options;
  const started = Date.now();
  try {
    if (req.method !== "POST") return ok({ success: false, error: "method_not_allowed" }, { status: 405 });
    if (!cronSecretMatches(req)) return ok({ success: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const source = String(body?.source || "manual");
    const force = body?.force === true;
    const supabase = createSupabaseAdminClient();
    const to = recipients();
    if (!to.length) throw new Error("No platform error digest recipients configured");

    if (source === "critical") return await sendCritical(supabase, String(body?.event_id || ""), to);
    if (source === "cron" && !force && !isEasternDigestTime()) return ok({ success: true, skipped: true, reason: "outside_6_15_am_eastern_window" });

    const now = Date.now();
    const rows = await recentErrors(supabase);
    const previous24 = await countErrors(supabase, new Date(now - 2 * 86400000).toISOString(), new Date(now - 86400000).toISOString());
    const digest = buildDigest(rows, previous24);
    const email = await sendEmail({ to, senderKey: "admin", subject: `TheOutHaven Platform Errors — ${digest.summary.errors_24h} errors · ${digest.summary.user_visible_24h} user-visible`, html: digest.html });
    const sent = email?.sent === true;
    await logCronJobRun(supabase, { job_name: JOB_NAME, function_name: JOB_NAME, source, status: sent ? "success" : "warning", started_at: new Date(started).toISOString(), finished_at: new Date().toISOString(), duration_ms: Date.now() - started, checked_count: rows.length, success_count: sent ? 1 : 0, failed_count: sent ? 0 : 1, schedule_hint: "6:15 AM America/New_York", details: { ...digest.summary, recipient_count: to.length, email } });
    return ok({ success: sent, sent, recipient_count: to.length, email, summary: digest.summary });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : String(error));
  }
});
