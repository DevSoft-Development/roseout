import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logCronJobRun } from "../_shared/cronLogger.ts";
import { sendEmail } from "../_shared/email.ts";

type Row = Record<string, any>;
type RankItem = { label: string; score: number; current: number; baseline: number; trendPct: number | null; meta?: string };

const JOB_NAME = "admin-daily-marketing-pulse";
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
const WEIGHTS: Record<string, number> = {
  profile_view: 1,
  search_click: 3,
  share_click: 4,
  reservation_started: 5,
  reservation_completed: 8,
  website_click: 3,
};

function esc(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function siteUrl() {
  return (Deno.env.get("NEXT_PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://theouthaven.com").replace(/\/$/, "");
}
function recipients() {
  return (Deno.env.get("MARKETING_PULSE_TO") || Deno.env.get("ADMIN_EMAIL") || Deno.env.get("SUPERADMIN_EMAIL") || "")
    .split(",").map((v) => v.trim()).filter(Boolean);
}
function cronSecretMatches(req: Request) {
  const expected = Deno.env.get("CRON_SECRET");
  return Boolean(expected) && req.headers.get("x-cron-secret") === expected;
}
function easternParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { hour: Number(value("hour")), minute: Number(value("minute")) };
}
function isEasternSendTime(date = new Date()) {
  const p = easternParts(date);
  return p.hour === 7 && p.minute >= 25 && p.minute <= 40;
}
function pct(current: number, baseline: number) {
  if (!baseline) return current ? null : 0;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}
function pctLabel(value: number | null) {
  if (value == null) return "new / no baseline";
  if (value === 0) return "flat";
  return `${value > 0 ? "+" : ""}${value}%`;
}
function scoreEvent(row: Row) {
  return WEIGHTS[String(row.event_type ?? "")] ?? 1;
}
function since(hours: number) { return new Date(Date.now() - hours * 3600000).toISOString(); }

async function getLocationEvents(supabase: any) {
  const { data, error } = await supabase.from("location_analytics_events")
    .select("location_id,event_type,event_name,created_at")
    .gte("created_at", since(24 * 8)).order("created_at", { ascending: false }).limit(5000);
  if (error) throw error;
  return data ?? [];
}
async function getLocations(supabase: any, ids: string[]) {
  if (!ids.length) return new Map<string, Row>();
  const { data, error } = await supabase.from("locations")
    .select("id,name,city,state,borough,neighborhood,location_type,cuisine,activity_type,category")
    .in("id", ids.slice(0, 1000));
  if (error) throw error;
  return new Map((data ?? []).map((row: Row) => [String(row.id), row]));
}
async function getSearches(supabase: any) {
  const { data, error } = await supabase.from("search_events")
    .select("created_at,raw_query,normalized_query,search_type,primary_domain,city,borough,neighborhood")
    .eq("source", "public_create_search").eq("route", "/api/generate")
    .gte("created_at", since(24 * 8)).order("created_at", { ascending: false }).limit(3000);
  if (error) throw error;
  return data ?? [];
}
async function getAttribution(supabase: any) {
  const { data, error } = await supabase.from("marketing_attribution_events")
    .select("source,medium,campaign,event_type,occurred_at")
    .gte("occurred_at", since(24)).order("occurred_at", { ascending: false }).limit(3000);
  if (error) throw error;
  return data ?? [];
}

function aggregateBy<T extends Row>(rows: T[], keyFn: (row: T) => string | null, scoreFn: (row: T) => number, currentField: "created_at" | "occurred_at" = "created_at") {
  const now = Date.now();
  const currentStart = now - 24 * 3600000;
  const priorStart = now - 8 * 24 * 3600000;
  const priorEnd = currentStart;
  const map = new Map<string, { current: number; prior: number }>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const ts = Date.parse(String(row[currentField] ?? ""));
    if (!Number.isFinite(ts)) continue;
    const bucket = map.get(key) ?? { current: 0, prior: 0 };
    const value = scoreFn(row);
    if (ts >= currentStart) bucket.current += value;
    else if (ts >= priorStart && ts < priorEnd) bucket.prior += value;
    map.set(key, bucket);
  }
  return map;
}
function ranked(map: Map<string, { current: number; prior: number }>, labelFn: (key: string) => string, minCurrent = 1): RankItem[] {
  return [...map.entries()].map(([key, v]) => {
    const baseline = v.prior / 7;
    return { label: labelFn(key), score: v.current, current: v.current, baseline, trendPct: pct(v.current, baseline) };
  }).filter((x) => x.current >= minCurrent).sort((a, b) => b.score - a.score).slice(0, 8);
}
function rising(items: RankItem[]) {
  return [...items].filter((x) => x.current >= 2 && (x.trendPct == null || x.trendPct > 0))
    .sort((a, b) => (b.trendPct ?? 9999) - (a.trendPct ?? 9999)).slice(0, 6);
}
function list(items: RankItem[], empty: string) {
  if (!items.length) return `<div style="color:${BRAND.muted};font-size:13px">${esc(empty)}</div>`;
  return `<table width="100%" cellspacing="0" cellpadding="0">${items.map((item, i) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${BRAND.border}"><div style="color:${BRAND.text};font-size:13px;font-weight:800">${i + 1}. ${esc(item.label)}</div>${item.meta ? `<div style="color:${BRAND.subtle};font-size:11px;margin-top:3px">${esc(item.meta)}</div>` : ""}</td><td align="right" style="padding:10px 0;border-bottom:1px solid ${BRAND.border}"><div style="color:${BRAND.text};font-size:13px;font-weight:850">${Math.round(item.current)}</div><div style="color:${item.trendPct != null && item.trendPct < 0 ? BRAND.amber : BRAND.green};font-size:11px">${esc(pctLabel(item.trendPct))}</div></td></tr>`).join("")}</table>`;
}
function metric(label: string, value: string | number, helper: string, tone = BRAND.text) {
  return `<td width="33.33%" valign="top" style="padding:6px"><div style="background:${BRAND.elevated};border:1px solid ${BRAND.border};border-radius:14px;padding:15px;min-height:88px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:${BRAND.subtle};font-weight:850">${esc(label)}</div><div style="font-size:24px;line-height:30px;color:${tone};font-weight:900;margin-top:5px">${esc(value)}</div><div style="font-size:11px;line-height:17px;color:${BRAND.muted};margin-top:3px">${esc(helper)}</div></div></td>`;
}
function section(title: string, body: string) {
  return `<div style="margin-top:22px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${BRAND.red};font-weight:900;margin-bottom:10px">${esc(title)}</div><div style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:18px;padding:18px">${body}</div></div>`;
}

function buildEmail(input: { events: Row[]; locations: Map<string, Row>; searches: Row[]; attribution: Row[] }) {
  const { events, locations, searches, attribution } = input;
  const locationAgg = aggregateBy(events, (r) => r.location_id ? String(r.location_id) : null, scoreEvent);
  const topLocations = ranked(locationAgg, (id) => locations.get(id)?.name || "Unknown location").map((x) => {
    const id = [...locationAgg.entries()].find(([k, v]) => (locations.get(k)?.name || "Unknown location") === x.label && v.current === x.current)?.[0];
    const loc = id ? locations.get(id) : null;
    return { ...x, meta: [loc?.neighborhood, loc?.borough, loc?.city].filter(Boolean).join(" · ") };
  });
  const trendingLocations = rising(topLocations);
  const neighborhoodAgg = aggregateBy(events, (r) => {
    const loc = locations.get(String(r.location_id ?? ""));
    return loc?.neighborhood ? String(loc.neighborhood) : null;
  }, scoreEvent);
  const neighborhoods = ranked(neighborhoodAgg, (x) => x);
  const trendingNeighborhoods = rising(neighborhoods);
  const cuisineAgg = aggregateBy(events, (r) => {
    const loc = locations.get(String(r.location_id ?? ""));
    return loc?.cuisine ? String(loc.cuisine) : null;
  }, scoreEvent);
  const activityAgg = aggregateBy(events, (r) => {
    const loc = locations.get(String(r.location_id ?? ""));
    return loc?.activity_type ? String(loc.activity_type) : null;
  }, scoreEvent);
  const searchAgg = aggregateBy(searches, (r) => String(r.normalized_query || r.raw_query || "").trim() || null, () => 1);
  const searchThemes = ranked(searchAgg, (x) => x);
  const sourceCounts = new Map<string, number>();
  for (const row of attribution) {
    const key = [row.source, row.medium].filter(Boolean).join(" / ") || "unattributed";
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  const sources = [...sourceCounts.entries()].map(([label, current]) => ({ label, score: current, current, baseline: 0, trendPct: null })).sort((a,b) => b.current-a.current).slice(0,8);

  const last24 = events.filter((e) => Date.parse(String(e.created_at)) >= Date.now() - 86400000);
  const profileViews = last24.filter((e) => e.event_type === "profile_view").length;
  const searchClicks = last24.filter((e) => e.event_type === "search_click").length;
  const saves = last24.filter((e) => e.event_type === "share_click").length;
  const reservations = last24.filter((e) => e.event_type === "reservation_started" || e.event_type === "reservation_completed").length;
  const search24 = searches.filter((e) => Date.parse(String(e.created_at)) >= Date.now() - 86400000).length;
  const engagementScore = last24.reduce((sum, e) => sum + scoreEvent(e), 0);

  const opportunityLines = [
    trendingNeighborhoods[0] ? `Feature ${trendingNeighborhoods[0].label} in today's social/content plan (${pctLabel(trendingNeighborhoods[0].trendPct)} vs 7-day daily average).` : null,
    trendingLocations[0] ? `Consider spotlighting ${trendingLocations[0].label}; it is the fastest-rising location today.` : null,
    rising(ranked(cuisineAgg, (x) => x))[0] ? `${rising(ranked(cuisineAgg, (x) => x))[0].label} interest is rising; consider cuisine-led content.` : null,
    rising(ranked(activityAgg, (x) => x))[0] ? `${rising(ranked(activityAgg, (x) => x))[0].label} is gaining attention; consider an activity-focused post.` : null,
  ].filter(Boolean) as string[];

  const html = `<!doctype html><html><body style="margin:0;background:${BRAND.bg};font-family:Arial,Helvetica,sans-serif;color:${BRAND.text}"><table role="presentation" width="100%" style="background:${BRAND.bg};padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:720px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:26px;overflow:hidden"><tr><td style="padding:30px;background:linear-gradient(135deg,#141010,#1c1614 60%,#2a0d13);border-bottom:1px solid ${BRAND.border}"><div style="font-size:22px;font-weight:900">TheOutHaven</div><div style="margin-top:7px;color:${BRAND.muted};font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:900">Daily Marketing Pulse</div><h1 style="font-size:30px;line-height:36px;margin:18px 0 6px">What people are interested in right now</h1><div style="color:${BRAND.muted};font-size:14px;line-height:21px">Audience interest, location momentum, neighborhood trends and content opportunities from production behavior.</div></td></tr><tr><td style="padding:24px">
  <table role="presentation" width="100%"><tr>${metric("Profile Views", profileViews, "Last 24 hours", BRAND.blue)}${metric("Search Clicks", searchClicks, "Location clicks from search", BRAND.green)}${metric("Saves / Shares", saves, "High-intent engagement", BRAND.amber)}</tr><tr>${metric("Outing Searches", search24, "Public /create searches")}${metric("Reservation Interest", reservations, "Starts + completions")}${metric("Engagement Score", engagementScore, "Weighted marketing-interest signal")}</tr></table>
  ${section("Top Locations", list(topLocations, "No location engagement recorded in the last 24 hours."))}
  ${section("Trending Locations", list(trendingLocations, "No locations are rising materially versus the 7-day baseline yet."))}
  ${section("Trending Neighborhoods", list(trendingNeighborhoods, "No neighborhood trend has enough signal yet."))}
  ${section("Top Neighborhoods", list(neighborhoods, "No neighborhood engagement recorded yet."))}
  ${section("Trending Cuisines", list(rising(ranked(cuisineAgg, (x) => x)), "No cuisine trend has enough signal yet."))}
  ${section("Trending Activities", list(rising(ranked(activityAgg, (x) => x)), "No activity trend has enough signal yet."))}
  ${section("Top Search Themes", list(searchThemes, "No public search themes recorded in the last 24 hours."))}
  ${section("Acquisition Sources", list(sources, "No marketing-attribution events recorded in the last 24 hours."))}
  ${section("Marketing Opportunities", opportunityLines.length ? opportunityLines.map((line) => `<div style="padding:8px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;line-height:20px">${esc(line)}</div>`).join("") : `<div style="color:${BRAND.muted};font-size:13px">Not enough fresh trend movement to recommend a campaign angle today.</div>`)}
  <div style="margin-top:24px;text-align:center"><a href="${esc(siteUrl())}/admin/dashboard/marketing" style="display:inline-block;background:${BRAND.red};color:white;text-decoration:none;font-weight:850;padding:13px 20px;border-radius:999px">Open Marketing Dashboard</a></div>
</td></tr></table><div style="max-width:720px;color:${BRAND.subtle};font-size:11px;line-height:17px;text-align:center;margin-top:14px">TheOutHaven.com · Daily Marketing Pulse · 7:30 AM Eastern</div></td></tr></table></body></html>`;

  return { html, summary: { profile_views_24h: profileViews, search_clicks_24h: searchClicks, saves_24h: saves, reservation_interest_24h: reservations, searches_24h: search24, engagement_score_24h: engagementScore, top_location: topLocations[0]?.label ?? null, trending_location: trendingLocations[0]?.label ?? null, trending_neighborhood: trendingNeighborhoods[0]?.label ?? null } };
}

Deno.serve(async (req: Request) => {
  const options = handleOptions(req); if (options) return options;
  const started = Date.now();
  try {
    if (req.method !== "POST") return ok({ success: false, error: "method_not_allowed" }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const source = String(body?.source || "manual");
    const force = body?.force === true;
    if (source === "cron" && !cronSecretMatches(req)) return ok({ success: false, error: "unauthorized" }, { status: 401 });
    if (source === "cron" && !force && !isEasternSendTime()) return ok({ success: true, skipped: true, reason: "outside_7_30_am_eastern_window" });

    const supabase = createSupabaseAdminClient();
    const events = await getLocationEvents(supabase);
    const ids = [...new Set(events.map((e: Row) => String(e.location_id || "")).filter(Boolean))];
    const [locations, searches, attribution] = await Promise.all([getLocations(supabase, ids), getSearches(supabase), getAttribution(supabase)]);
    const digest = buildEmail({ events, locations, searches, attribution });
    const to = recipients();
    if (!to.length) throw new Error("No marketing pulse recipients configured");
    const email = await sendEmail({ to, senderKey: "admin", subject: `TheOutHaven Marketing Pulse — ${digest.summary.top_location || "Daily trends"}`, html: digest.html });
    const sent = email?.sent === true;
    await logCronJobRun(supabase, { job_name: JOB_NAME, function_name: JOB_NAME, source, status: sent ? "success" : "warning", started_at: new Date(started).toISOString(), finished_at: new Date().toISOString(), duration_ms: Date.now() - started, checked_count: events.length, success_count: sent ? 1 : 0, failed_count: sent ? 0 : 1, schedule_hint: "7:30 AM America/New_York", details: { ...digest.summary, recipient_count: to.length, email } });
    return ok({ success: sent, sent, recipient_count: to.length, email, summary: digest.summary });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : String(error));
  }
});
