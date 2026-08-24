import { supabaseAdmin } from "@/lib/supabase-admin";

export type MarketingReportType =
  | "overview"
  | "website_traffic"
  | "search_activity"
  | "search_funnel"
  | "locations"
  | "neighborhoods"
  | "cuisines"
  | "activities"
  | "occasions"
  | "acquisition"
  | "campaigns"
  | "content"
  | "email"
  | "qr_postcards"
  | "events_experiences"
  | "geography";

export type MarketingReportConfig = {
  reportType: MarketingReportType;
  dateRange: "today" | "yesterday" | "last_7_days" | "last_30_days" | "this_month" | "last_month";
  comparison: "previous_period" | "previous_week" | "previous_month" | "none";
  breakdown: "day" | "week" | "neighborhood" | "borough" | "market" | "source" | "campaign" | "device" | "location" | "cuisine" | "activity";
  filters?: Record<string, string | number | boolean | null | undefined>;
};

export type MarketingReportMetric = {
  label: string;
  value: number | string;
  helper?: string;
  changePct?: number | null;
};

export type MarketingReportRow = {
  label: string;
  value: number;
  secondary?: string;
  changePct?: number | null;
};

export type MarketingReportResult = {
  title: string;
  subtitle: string;
  periodLabel: string;
  comparisonLabel: string | null;
  metrics: MarketingReportMetric[];
  rows: MarketingReportRow[];
  insights: string[];
  funnel?: Array<{ label: string; count: number; conversionPct: number; dropoffPct: number }>;
  generatedAt: string;
};

type Range = { start: Date; end: Date; label: string };
type Row = Record<string, any>;

const DAY = 86_400_000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function resolveRange(key: MarketingReportConfig["dateRange"], now = new Date()): Range {
  const today = startOfDay(now);
  if (key === "today") return { start: today, end: now, label: "Today" };
  if (key === "yesterday") return { start: new Date(today.getTime() - DAY), end: today, label: "Yesterday" };
  if (key === "last_7_days") return { start: new Date(now.getTime() - 7 * DAY), end: now, label: "Last 7 days" };
  if (key === "this_month") return { start: startOfMonth(now), end: now, label: "This month" };
  if (key === "last_month") {
    const end = startOfMonth(now);
    const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    return { start, end, label: "Last month" };
  }
  return { start: new Date(now.getTime() - 30 * DAY), end: now, label: "Last 30 days" };
}

function resolveComparison(config: MarketingReportConfig, current: Range): Range | null {
  if (config.comparison === "none") return null;
  if (config.comparison === "previous_week") {
    return { start: new Date(current.start.getTime() - 7 * DAY), end: new Date(current.end.getTime() - 7 * DAY), label: "Previous week" };
  }
  if (config.comparison === "previous_month") {
    return { start: new Date(current.start.getFullYear(), current.start.getMonth() - 1, current.start.getDate()), end: new Date(current.end.getFullYear(), current.end.getMonth() - 1, current.end.getDate()), label: "Previous month" };
  }
  const length = current.end.getTime() - current.start.getTime();
  return { start: new Date(current.start.getTime() - length), end: current.start, label: "Previous period" };
}

function pct(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function inRange(ts: unknown, range: Range) {
  const t = Date.parse(String(ts || ""));
  return Number.isFinite(t) && t >= range.start.getTime() && t < range.end.getTime();
}

function countDistinct(rows: Row[], key: string) {
  return new Set(rows.map((r) => String(r[key] || "")).filter(Boolean)).size;
}

function ranking(rows: Row[], keyFn: (row: Row) => string | null, previousRows: Row[], top = 20) {
  const current = new Map<string, number>();
  const previous = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row);
    if (key) current.set(key, (current.get(key) || 0) + 1);
  }
  for (const row of previousRows) {
    const key = keyFn(row);
    if (key) previous.set(key, (previous.get(key) || 0) + 1);
  }
  return [...current.entries()]
    .map(([label, value]) => ({ label, value, changePct: pct(value, previous.get(label) || 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}

function formatSeconds(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function reportTitle(type: MarketingReportType) {
  const labels: Record<MarketingReportType, string> = {
    overview: "Marketing performance overview",
    website_traffic: "Website traffic",
    search_activity: "Search activity",
    search_funnel: "Search funnel",
    locations: "Location interest",
    neighborhoods: "Neighborhood interest",
    cuisines: "Cuisine interest",
    activities: "Activity interest",
    occasions: "Occasion interest",
    acquisition: "Traffic sources",
    campaigns: "Campaign performance",
    content: "Content performance",
    email: "Email marketing",
    qr_postcards: "QR and postcard performance",
    events_experiences: "Events and experiences interest",
    geography: "Geographic performance",
  };
  return labels[type];
}

export async function runMarketingReport(config: MarketingReportConfig): Promise<MarketingReportResult> {
  const current = resolveRange(config.dateRange);
  const previous = resolveComparison(config, current);
  const earliest = previous && previous.start < current.start ? previous.start : current.start;

  const [analyticsResult, searchResult, locationEventResult, attributionResult, locationsResult, socialResult] = await Promise.all([
    supabaseAdmin.from("analytics_events").select("event_name,event_type,canonical_event_name,page_path,session_id,anonymous_id,source,device_type,metadata,created_at").gte("created_at", earliest.toISOString()).lt("created_at", current.end.toISOString()).eq("is_bot", false).limit(20000),
    supabaseAdmin.from("search_events").select("created_at,raw_query,normalized_query,search_type,primary_domain,city,borough,neighborhood").eq("source", "public_create_search").eq("route", "/api/generate").gte("created_at", earliest.toISOString()).lt("created_at", current.end.toISOString()).limit(20000),
    supabaseAdmin.from("location_analytics_events").select("location_id,event_type,event_name,created_at").gte("created_at", earliest.toISOString()).lt("created_at", current.end.toISOString()).limit(20000),
    supabaseAdmin.from("marketing_attribution_events").select("source,medium,campaign,event_type,content_item_id,social_post_id,occurred_at").gte("occurred_at", earliest.toISOString()).lt("occurred_at", current.end.toISOString()).limit(20000),
    supabaseAdmin.from("locations").select("id,name,city,state,borough,neighborhood,location_type,cuisine,activity_type,category").limit(10000),
    supabaseAdmin.from("social_post_metric_snapshots").select("social_post_id,provider,captured_at,views,reach,likes,comments,shares,saves,clicks").gte("captured_at", earliest.toISOString()).lt("captured_at", current.end.toISOString()).limit(20000),
  ]);

  const analytics = analyticsResult.data || [];
  const searches = searchResult.data || [];
  const locationEvents = locationEventResult.data || [];
  const attribution = attributionResult.data || [];
  const locations = new Map((locationsResult.data || []).map((r: Row) => [String(r.id), r]));
  const social = socialResult.data || [];

  const currAnalytics = analytics.filter((r) => inRange(r.created_at, current));
  const prevAnalytics = previous ? analytics.filter((r) => inRange(r.created_at, previous)) : [];
  const currSearches = searches.filter((r) => inRange(r.created_at, current));
  const prevSearches = previous ? searches.filter((r) => inRange(r.created_at, previous)) : [];
  const currLocation = locationEvents.filter((r) => inRange(r.created_at, current));
  const prevLocation = previous ? locationEvents.filter((r) => inRange(r.created_at, previous)) : [];
  const currAttr = attribution.filter((r) => inRange(r.occurred_at, current));
  const prevAttr = previous ? attribution.filter((r) => inRange(r.occurred_at, previous)) : [];
  const currSocial = social.filter((r) => inRange(r.captured_at, current));
  const prevSocial = previous ? social.filter((r) => inRange(r.captured_at, previous)) : [];

  const eventKey = (r: Row) => String(r.canonical_event_name || r.event_name || r.event_type || "");
  const pageViews = currAnalytics.filter((r) => eventKey(r) === "page_view");
  const prevPageViews = prevAnalytics.filter((r) => eventKey(r) === "page_view");
  const homeViews = pageViews.filter((r) => r.page_path === "/").length;
  const prevHomeViews = prevPageViews.filter((r) => r.page_path === "/").length;
  const createViews = pageViews.filter((r) => r.page_path === "/create").length;
  const prevCreateViews = prevPageViews.filter((r) => r.page_path === "/create").length;
  const sessions = countDistinct(currAnalytics, "session_id") || countDistinct(currAnalytics, "anonymous_id");
  const prevSessions = countDistinct(prevAnalytics, "session_id") || countDistinct(prevAnalytics, "anonymous_id");
  const durations = currAnalytics.filter((r) => eventKey(r) === "session_heartbeat").map((r) => Number(r.metadata?.session_duration_seconds || 0)).filter((n) => Number.isFinite(n) && n > 0);
  const avgSession = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const prevDurations = prevAnalytics.filter((r) => eventKey(r) === "session_heartbeat").map((r) => Number(r.metadata?.session_duration_seconds || 0)).filter((n) => Number.isFinite(n) && n > 0);
  const prevAvgSession = prevDurations.length ? prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length : 0;

  const visitorKey = (r: Row) => String(r.session_id || r.anonymous_id || "");
  const funnelStages = [
    ["Create viewed", (r: Row) => eventKey(r) === "page_view" && r.page_path === "/create"],
    ["Search started", (r: Row) => eventKey(r) === "search_started"],
    ["Results shown", (r: Row) => ["search_completed", "search_results_impression"].includes(eventKey(r))],
    ["Result engaged", (r: Row) => ["location_clicked", "result_clicked", "pair_clicked", "result_opened"].includes(eventKey(r))],
    ["Plan reached", (r: Row) => r.page_path === "/plan"],
    ["Plan action", (r: Row) => r.page_path === "/plan" && ["outing_created", "reservation_started", "website_clicked", "directions_clicked", "call_clicked", "book_my_outing_clicked", "outing_details_clicked"].includes(eventKey(r))],
  ] as const;
  const funnel = funnelStages.map(([label, fn], index) => {
    const count = new Set(currAnalytics.filter(fn).map(visitorKey).filter(Boolean)).size;
    const prior = index === 0 ? count : new Set(currAnalytics.filter(funnelStages[index - 1][1]).map(visitorKey).filter(Boolean)).size;
    const conversionPct = prior ? Math.round((count / prior) * 1000) / 10 : 0;
    return { label, count, conversionPct, dropoffPct: prior ? Math.max(0, Math.round((1 - count / prior) * 1000) / 10) : 0 };
  });

  const baseMetrics: MarketingReportMetric[] = [
    { label: "Website visits", value: pageViews.length, changePct: pct(pageViews.length, prevPageViews.length) },
    { label: "Visitor sessions", value: sessions, changePct: pct(sessions, prevSessions) },
    { label: "Homepage views", value: homeViews, changePct: pct(homeViews, prevHomeViews) },
    { label: "Create views", value: createViews, changePct: pct(createViews, prevCreateViews) },
    { label: "Searches", value: currSearches.length, changePct: pct(currSearches.length, prevSearches.length) },
    { label: "Average session time", value: formatSeconds(avgSession), changePct: pct(avgSession, prevAvgSession) },
  ];

  let rows: MarketingReportRow[] = [];
  let metrics = baseMetrics;
  const insights: string[] = [];

  if (config.reportType === "search_funnel") {
    metrics = [
      { label: "Create visitors", value: funnel[0].count },
      { label: "Search starters", value: funnel[1].count },
      { label: "Full-flow completions", value: funnel[4].count },
      { label: "Completion rate", value: `${funnel[0].count ? Math.round((funnel[4].count / funnel[0].count) * 1000) / 10 : 0}%` },
    ];
    const biggest = [...funnel.slice(1)].sort((a, b) => b.dropoffPct - a.dropoffPct)[0];
    if (biggest) insights.push(`The largest audience drop-off is before ${biggest.label.toLowerCase()}, where ${biggest.dropoffPct}% of the prior step is lost.`);
  } else if (config.reportType === "locations") {
    rows = ranking(currLocation, (r) => locations.get(String(r.location_id))?.name || null, prevLocation);
  } else if (config.reportType === "neighborhoods") {
    rows = ranking(currLocation, (r) => locations.get(String(r.location_id))?.neighborhood || null, prevLocation);
  } else if (config.reportType === "cuisines") {
    rows = ranking(currLocation, (r) => locations.get(String(r.location_id))?.cuisine || null, prevLocation);
  } else if (config.reportType === "activities") {
    rows = ranking(currLocation, (r) => locations.get(String(r.location_id))?.activity_type || null, prevLocation);
  } else if (config.reportType === "occasions") {
    rows = ranking(currSearches, (r) => String(r.search_type || r.primary_domain || "").trim() || null, prevSearches);
  } else if (config.reportType === "acquisition") {
    rows = ranking(currAttr, (r) => [r.source, r.medium].filter(Boolean).join(" / ") || "Direct / unattributed", prevAttr);
  } else if (config.reportType === "campaigns") {
    rows = ranking(currAttr, (r) => String(r.campaign || "").trim() || null, prevAttr);
  } else if (config.reportType === "content") {
    rows = ranking(currSocial, (r) => String(r.provider || "Social").trim(), prevSocial);
    const totalReach = currSocial.reduce((sum, r) => sum + Number(r.reach || 0), 0);
    const totalViews = currSocial.reduce((sum, r) => sum + Number(r.views || 0), 0);
    metrics = [...baseMetrics.slice(0, 2), { label: "Content views", value: totalViews }, { label: "Content reach", value: totalReach }];
  } else if (config.reportType === "email") {
    rows = ranking(currAttr.filter((r) => String(r.source || "").toLowerCase().includes("email") || String(r.medium || "").toLowerCase().includes("email")), (r) => String(r.event_type || "Email activity"), prevAttr);
  } else if (config.reportType === "qr_postcards") {
    rows = ranking(currAttr.filter((r) => /qr|postcard/i.test(`${r.source || ""} ${r.medium || ""} ${r.campaign || ""}`)), (r) => String(r.event_type || "QR activity"), prevAttr);
  } else if (config.reportType === "events_experiences") {
    rows = ranking(currSearches.filter((r) => /event|experience/i.test(`${r.search_type || ""} ${r.primary_domain || ""} ${r.raw_query || ""}`)), (r) => String(r.normalized_query || r.raw_query || "").trim() || null, prevSearches);
  } else if (config.reportType === "geography") {
    rows = ranking(currSearches, (r) => String(r.neighborhood || r.borough || r.city || "").trim() || null, prevSearches);
  } else if (config.reportType === "search_activity") {
    rows = ranking(currSearches, (r) => String(r.normalized_query || r.raw_query || "").trim() || null, prevSearches);
  } else if (config.reportType === "website_traffic") {
    rows = ranking(pageViews, (r) => String(r.page_path || "").trim() || null, prevPageViews);
  } else {
    rows = ranking(currSearches, (r) => String(r.neighborhood || r.borough || r.city || "").trim() || null, prevSearches, 10);
  }

  if (rows[0]) {
    insights.push(`${rows[0].label} is the strongest item in this report with ${rows[0].value.toLocaleString()} recorded interactions.`);
    if (rows[0].changePct != null && rows[0].changePct > 10) insights.push(`${rows[0].label} is rising ${rows[0].changePct}% versus the selected comparison period.`);
  }
  const searchChange = pct(currSearches.length, prevSearches.length);
  if (searchChange != null) insights.push(`Search activity is ${searchChange >= 0 ? "up" : "down"} ${Math.abs(searchChange)}% versus the selected comparison period.`);

  return {
    title: reportTitle(config.reportType),
    subtitle: "Marketing intelligence from TheOutHaven production behavior and campaign activity.",
    periodLabel: current.label,
    comparisonLabel: previous?.label || null,
    metrics,
    rows,
    insights: insights.slice(0, 5),
    funnel: config.reportType === "search_funnel" ? funnel : undefined,
    generatedAt: new Date().toISOString(),
  };
}

export function marketingReportEmailHtml(report: MarketingReportResult) {
  const metricHtml = report.metrics.map((m) => `<td style="padding:6px;width:33%"><div style="background:#1c1614;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#8f817a;font-weight:800">${escapeHtml(m.label)}</div><div style="font-size:24px;color:#fff7f2;font-weight:900;margin-top:5px">${escapeHtml(m.value)}</div>${m.changePct == null ? "" : `<div style="font-size:11px;color:${m.changePct >= 0 ? "#70df8b" : "#f5c76b"};margin-top:4px">${m.changePct >= 0 ? "+" : ""}${m.changePct}%</div>`}</div></td>`).join("");
  const rowsHtml = report.rows.slice(0, 15).map((r, i) => `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.10);color:#fff7f2">${i + 1}. ${escapeHtml(r.label)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.10);color:#fff7f2;font-weight:800">${r.value.toLocaleString()}${r.changePct == null ? "" : `<div style="font-size:11px;color:${r.changePct >= 0 ? "#70df8b" : "#f5c76b"}">${r.changePct >= 0 ? "+" : ""}${r.changePct}%</div>`}</td></tr>`).join("");
  const insights = report.insights.map((x) => `<li style="margin:0 0 8px">${escapeHtml(x)}</li>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#090706;font-family:Arial,Helvetica,sans-serif;color:#fff7f2"><table role="presentation" width="100%" style="padding:28px 12px;background:#090706"><tr><td align="center"><table width="100%" style="max-width:720px;background:#141010;border:1px solid rgba(255,255,255,.12);border-radius:24px;overflow:hidden"><tr><td style="padding:28px;background:linear-gradient(135deg,#141010,#1c1614 60%,#2a0d13)"><div style="font-size:22px;font-weight:900">TheOutHaven</div><div style="color:#b8aaa3;font-size:11px;text-transform:uppercase;letter-spacing:.18em;margin-top:7px">Marketing Intelligence</div><h1 style="margin:16px 0 4px;font-size:30px">${escapeHtml(report.title)}</h1><div style="color:#b8aaa3">${escapeHtml(report.periodLabel)}${report.comparisonLabel ? ` · compared with ${escapeHtml(report.comparisonLabel)}` : ""}</div></td></tr><tr><td style="padding:22px"><table width="100%"><tr>${metricHtml}</tr></table>${report.rows.length ? `<div style="margin-top:22px;color:#e1062a;font-size:11px;text-transform:uppercase;font-weight:900;letter-spacing:.08em">Top results</div><table width="100%" style="margin-top:8px">${rowsHtml}</table>` : ""}${insights ? `<div style="margin-top:22px;color:#e1062a;font-size:11px;text-transform:uppercase;font-weight:900;letter-spacing:.08em">What this means</div><ul style="color:#b8aaa3;line-height:1.5">${insights}</ul>` : ""}<p style="margin-top:24px"><a href="https://theouthaven.com/admin/dashboard/marketing/reports" style="display:inline-block;background:#e1062a;color:#fff;text-decoration:none;border-radius:999px;padding:13px 20px;font-weight:800">Open Marketing Reports</a></p></td></tr></table></td></tr></table></body></html>`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
