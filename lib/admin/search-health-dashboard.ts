import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const SLOW_SEARCH_STATUSES = ["slow", "critical", "failed", "timeout", "degraded"] as const;
export const SEARCH_HEALTH_PAGE_SIZES = [25, 50, 100] as const;
export const SEARCH_HEALTH_SORTS = ["created_at", "timing_ms", "result_count"] as const;
const DEFAULT_SOURCE = "public_create_search";
const CORRELATION_WINDOW_MS = 5 * 60 * 1000;

export type SearchEvent = {
  id: string; created_at: string; source?: string | null; route?: string | null;
  raw_query: string | null; normalized_query?: string | null; search_type?: string | null;
  primary_domain?: string | null; borough?: string | null; neighborhood?: string | null;
  restaurant_count?: number | null; activity_count?: number | null; pair_count?: number | null;
  result_count: number | null; timing_ms: number | null; speed_status: string | null;
  success: boolean | null; had_issue: boolean | null; issue_type?: string | null;
  issue_label?: string | null; no_results_reason: string | null; no_pairs_reason: string | null;
  session_id?: string | null; metadata?: Record<string, unknown> | null;
};
export type HealthIssue = {
  id: string; created_at: string; source: string | null; raw_query: string | null;
  event_type: string | null; event_label: string | null; severity: string | null;
  review_status: string | null; restaurant_count: number | null; activity_count: number | null;
  pair_count: number | null; timing_ms: number | null; speed_status: string | null;
  no_results_reason: string | null; no_pairs_reason: string | null; debug?: unknown;
};
export type SearchHealthFilters = {
  preset: "24h" | "7d" | "30d" | "custom"; from: string; to: string; q: string;
  status: "all" | "healthy" | "issue" | "failed"; severity: string; reviewStatus: string;
  source: string; speed: string; hasIssue: "all" | "yes" | "no";
  noResults: "all" | "yes" | "no"; noPairs: "all" | "yes" | "no";
  page: number; issuePage: number; pageSize: 25 | 50 | 100;
  sort: (typeof SEARCH_HEALTH_SORTS)[number]; direction: "asc" | "desc"; issue: string | null;
};
export type SearchClassification = { failed: boolean; slow: boolean; noResults: boolean; noPairs: boolean; issue: boolean; healthy: boolean };
export type SearchHealthKpis = { total: number; healthy: number; issues: number; failed: number; slow: number; noResults: number; noPairs: number };

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export function normalizeSearchHealthQuery(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
export function isSlowSearch(row: Pick<SearchEvent, "timing_ms" | "speed_status">) {
  return (row.timing_ms !== null && row.timing_ms > 5000) || SLOW_SEARCH_STATUSES.includes((row.speed_status ?? "").toLowerCase() as typeof SLOW_SEARCH_STATUSES[number]);
}
export function resolveSearchHealthDateRange(preset: SearchHealthFilters["preset"], from?: string, to?: string, now = new Date()) {
  const end = preset === "custom" && to && !Number.isNaN(Date.parse(to)) ? new Date(to) : now;
  const days = preset === "24h" ? 1 : preset === "7d" ? 7 : 30;
  const start = preset === "custom" && from && !Number.isNaN(Date.parse(from)) ? new Date(from) : new Date(end.getTime() - days * 86_400_000);
  return start <= end ? { from: start.toISOString(), to: end.toISOString() } : { from: new Date(end.getTime() - 30 * 86_400_000).toISOString(), to: end.toISOString() };
}
export function parseSearchHealthFilters(input: Record<string, string | string[] | undefined>, now = new Date()): SearchHealthFilters {
  const preset = oneOf(first(input.range), ["24h", "7d", "30d", "custom"] as const, "30d");
  const range = resolveSearchHealthDateRange(preset, first(input.from), first(input.to), now);
  const size = Number(first(input.pageSize));
  return {
    preset, ...range, q: (first(input.q) ?? "").slice(0, 200),
    status: oneOf(first(input.status), ["all", "healthy", "issue", "failed"] as const, "all"),
    severity: oneOf(first(input.severity), ["all", "info", "warning", "error", "critical"] as const, "all"),
    reviewStatus: oneOf(first(input.review), ["open", "all", "new", "reviewing", "fixed", "ignored", "archived"] as const, "open"),
    source: (first(input.source) ?? DEFAULT_SOURCE).slice(0, 80), speed: oneOf(first(input.speed), ["all", ...SLOW_SEARCH_STATUSES] as const, "all"),
    hasIssue: oneOf(first(input.hasIssue), ["all", "yes", "no"] as const, "all"), noResults: oneOf(first(input.noResults), ["all", "yes", "no"] as const, "all"),
    noPairs: oneOf(first(input.noPairs), ["all", "yes", "no"] as const, "all"), page: Math.max(1, Number(first(input.page)) || 1), issuePage: Math.max(1, Number(first(input.issuePage)) || 1),
    pageSize: SEARCH_HEALTH_PAGE_SIZES.includes(size as 25 | 50 | 100) ? size as 25 | 50 | 100 : 25,
    sort: oneOf(first(input.sort), SEARCH_HEALTH_SORTS, "created_at"), direction: oneOf(first(input.direction), ["asc", "desc"] as const, "desc"), issue: first(input.issue) ?? null,
  };
}

function issueCorrelationId(value: SearchEvent | HealthIssue): string | null {
  const meta = "metadata" in value ? value.metadata : undefined;
  const debug = "debug" in value && value.debug && typeof value.debug === "object" ? value.debug as Record<string, unknown> : undefined;
  for (const key of ["search_event_id", "request_id", "trace_id", "session_id", "outing_id", "correlation_id"]) {
    const direct = key in value ? (value as unknown as Record<string, unknown>)[key] : undefined;
    const candidate = direct ?? meta?.[key] ?? debug?.[key];
    if (typeof candidate === "string" && candidate) return `${key}:${candidate}`;
  }
  return null;
}
export function correlateIssue(search: SearchEvent, issues: HealthIssue[]) {
  const direct = issueCorrelationId(search);
  if (direct) {
    const match = issues.find((issue) => issueCorrelationId(issue) === direct);
    if (match) return match;
  }
  const query = normalizeSearchHealthQuery(search.normalized_query || search.raw_query);
  if (!query) return undefined;
  return issues.find((issue) => normalizeSearchHealthQuery(issue.raw_query) === query && Math.abs(Date.parse(issue.created_at) - Date.parse(search.created_at)) <= CORRELATION_WINDOW_MS);
}
export function classifySearchEvent(row: SearchEvent, linkedIssue = false): SearchClassification {
  const failed = row.success === false; const slow = isSlowSearch(row);
  const noResults = row.no_results_reason !== null || row.result_count === 0;
  const noPairs = row.no_pairs_reason !== null;
  const issue = linkedIssue || row.had_issue === true || failed || noResults || noPairs;
  return { failed, slow, noResults, noPairs, issue, healthy: !failed && !issue };
}
export function buildSearchHealthKpis(searches: SearchEvent[], issues: HealthIssue[] = []): SearchHealthKpis {
  const out: SearchHealthKpis = { total: searches.length, healthy: 0, issues: 0, failed: 0, slow: 0, noResults: 0, noPairs: 0 };
  for (const row of searches) { const c = classifySearchEvent(row, Boolean(correlateIssue(row, issues))); if (c.healthy) out.healthy++; if (c.issue) out.issues++; if (c.failed) out.failed++; if (c.slow) out.slow++; if (c.noResults) out.noResults++; if (c.noPairs) out.noPairs++; }
  return out;
}
export function sanitizeSearchHealthDebug(value: unknown): unknown {
  const blocked = /authorization|password|token|secret|cookie|service.?role|api.?key/i;
  if (Array.isArray(value)) return value.map(sanitizeSearchHealthDebug);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, blocked.test(key) ? "[REDACTED]" : sanitizeSearchHealthDebug(item)]));
  return value;
}

export async function getSearchHealthDashboardData(filters: SearchHealthFilters) {
  let searches = supabaseAdmin.from("search_events").select("id,created_at,source,route,raw_query,normalized_query,search_type,primary_domain,borough,neighborhood,restaurant_count,activity_count,pair_count,result_count,timing_ms,speed_status,success,had_issue,issue_type,issue_label,no_results_reason,no_pairs_reason,session_id,metadata", { count: "exact" }).gte("created_at", filters.from).lte("created_at", filters.to).order(filters.sort, { ascending: filters.direction === "asc" }).range((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize - 1);
  if (filters.source !== "all") searches = searches.eq("source", filters.source); if (filters.q) searches = searches.ilike("raw_query", `%${filters.q.replace(/[%_,]/g, "")}%`);
  if (filters.speed !== "all") searches = searches.eq("speed_status", filters.speed);
  if (filters.status === "failed") searches = searches.eq("success", false);
  if (filters.status === "healthy") searches = searches.neq("success", false).eq("had_issue", false).is("no_results_reason", null).is("no_pairs_reason", null).neq("result_count", 0);
  if (filters.status === "issue") searches = searches.or("had_issue.eq.true,success.eq.false,no_results_reason.not.is.null,no_pairs_reason.not.is.null,result_count.eq.0");
  if (filters.hasIssue !== "all") searches = searches.eq("had_issue", filters.hasIssue === "yes");
  if (filters.noResults === "yes") searches = searches.or("no_results_reason.not.is.null,result_count.eq.0"); if (filters.noResults === "no") searches = searches.is("no_results_reason", null).neq("result_count", 0); if (filters.noPairs === "yes") searches = searches.not("no_pairs_reason", "is", null); if (filters.noPairs === "no") searches = searches.is("no_pairs_reason", null);
  let issues = supabaseAdmin.from("search_health_events").select("id,created_at,source,raw_query,event_type,event_label,severity,review_status,restaurant_count,activity_count,pair_count,timing_ms,speed_status,no_results_reason,no_pairs_reason,debug", { count: "exact" }).gte("created_at", filters.from).lte("created_at", filters.to).order("created_at", { ascending: false }).range((filters.issuePage - 1) * filters.pageSize, filters.issuePage * filters.pageSize - 1);
  if (filters.source !== "all") issues = issues.eq("source", filters.source); if (filters.q) issues = issues.ilike("raw_query", `%${filters.q.replace(/[%_,]/g, "")}%`); if (filters.severity !== "all") issues = issues.eq("severity", filters.severity); if (filters.reviewStatus === "open") issues = issues.in("review_status", ["new", "reviewing"]); else if (filters.reviewStatus !== "all") issues = issues.eq("review_status", filters.reviewStatus);
  const [searchResult, issueResult, kpiResult] = await Promise.all([searches, issues, supabaseAdmin.rpc("admin_search_health_kpis", { p_from: filters.from, p_to: filters.to, p_source: filters.source === "all" ? null : filters.source })]);
  const kpiRow = Array.isArray(kpiResult.data) ? kpiResult.data[0] : kpiResult.data;
  const kpis = kpiRow ? { total: Number(kpiRow.total_searches), healthy: Number(kpiRow.healthy_searches), issues: Number(kpiRow.searches_with_issues), failed: Number(kpiRow.failed_searches), slow: Number(kpiRow.slow_searches), noResults: Number(kpiRow.no_results), noPairs: Number(kpiRow.no_pairs) } : null;
  return { searches: (searchResult.data ?? []) as SearchEvent[], searchCount: searchResult.count ?? 0, issues: (issueResult.data ?? []) as HealthIssue[], issueCount: issueResult.count ?? 0, kpis, errors: { searches: searchResult.error?.message, issues: issueResult.error?.message, kpis: kpiResult.error?.message } };
}
