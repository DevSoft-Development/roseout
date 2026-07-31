import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runOutingSearch } from "@/lib/search/runSearch";
import type { SearchCoreOverride } from "@/lib/search/searchCoreConfig";
import { persistQaSearchLog } from "@/lib/search/quality/qaSearchLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ENGINES = new Set<SearchCoreOverride>(["legacy", "v2", "compare"]);
const MAX_QUERIES = 100;
type QaEngine = "legacy" | "v2" | "compare";
type SpeedStatus = "fast" | "good" | "slow" | "critical";
const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const strings = (value: unknown): string[] => asArray(value).map((item) => String(item ?? "").trim()).filter(Boolean);
const numberOrNull = (value: unknown): number | null => Number.isFinite(Number(value)) ? Number(value) : null;
const stringOrNull = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const clamp = (value: unknown, fallback: number, min: number, max: number) => { const numeric = Number(value); return Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.trunc(numeric))) : fallback; };
const classifySpeed = (totalMs: number): SpeedStatus => totalMs <= 1000 ? "fast" : totalMs <= 3000 ? "good" : totalMs <= 5000 ? "slow" : "critical";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function resolveEngine(request: NextRequest, body: any): QaEngine { const value = String(body?.searchCoreOverride ?? request.cookies.get("search_qa_engine")?.value ?? "legacy").toLowerCase() as SearchCoreOverride; return ENGINES.has(value) ? value as QaEngine : "legacy"; }
function debugOf(result: any) { return result?.debug ?? result?.diagnostics?.debug ?? {}; }
function searchPlanOf(result: any) { return result?.searchV2?.searchPlan ?? result?.searchPlan ?? {}; }
function intentOf(result: any) { return result?.parsedIntent ?? debugOf(result)?.normalizedIntent ?? searchPlanOf(result) ?? {}; }
function performanceOf(result: any) { return result?.performance ?? result?.searchPerformance ?? debugOf(result)?.performance ?? result?.searchV2?.timing ?? result?.timing ?? {}; }
function uniquePairVenueCount(pairs: any[], key: "restaurant" | "activity") { return new Set(pairs.map((pair) => pair?.[key]?.id ?? pair?.[key]?.source_id).filter(Boolean).map(String)).size; }
export function resultCounts(result: any) {
  const canonical = result?.searchV2?.counts ?? result?.counts ?? result?.debug?.canonicalCounts ?? {};
  const restaurantCards = asArray(result?.restaurantCards ?? result?.restaurants);
  const activityCards = asArray(result?.activityCards ?? result?.activities);
  const pairCards = asArray(result?.pairCards ?? result?.pairs);
  const pairRestaurants = uniquePairVenueCount(pairCards, "restaurant");
  const pairActivities = uniquePairVenueCount(pairCards, "activity");
  const restaurants = Math.max(Number(canonical.restaurantCards ?? result?.restaurant_count ?? (typeof result?.restaurants === "number" ? result.restaurants : restaurantCards.length)), pairRestaurants);
  const activities = Math.max(Number(canonical.activityCards ?? result?.activity_count ?? (typeof result?.activities === "number" ? result.activities : activityCards.length)), pairActivities);
  const pairs = Number(canonical.pairs ?? result?.pair_count ?? (typeof result?.pairs === "number" ? result.pairs : pairCards.length));
  const displayed = Number(canonical.displayedResults ?? result?.result_count ?? (pairs || restaurants + activities));
  return { restaurants, activities, pairs, displayed };
}
function buildSummary(index: number, query: string, engine: QaEngine, result: any, elapsedMs: number, extraWarnings: string[] = [], caughtError?: unknown) {
  const debug = debugOf(result); const plan = searchPlanOf(result); const intent = intentOf(result); const performance = performanceOf(result); const counts = resultCounts(result);
  const errors = [...strings(result?.errors), ...strings(debug?.errors), ...(result?.error ? [String(result.error)] : []), ...(caughtError instanceof Error ? [caughtError.message] : caughtError ? [String(caughtError)] : [])];
  const warnings = [...strings(result?.warnings), ...strings(debug?.warnings), ...extraWarnings];
  const mode = result?.searchV2?.requestedMode ?? plan?.mode ?? result?.search_type ?? result?.searchType ?? intent?.searchType ?? intent?.search_type ?? result?.render_mode ?? result?.renderMode;
  const domain = result?.primary_domain ?? result?.primaryDomain ?? intent?.primaryDomain ?? intent?.primary_domain;
  const totalMs = numberOrNull(performance?.total_ms ?? performance?.totalMs ?? result?.searchV2?.timing?.totalMs ?? result?.timing?.totalMs) ?? elapsedMs;
  const speedStatus = (stringOrNull(performance?.speed_status ?? performance?.speedStatus) ?? classifySpeed(totalMs)) as SpeedStatus;
  const parserSource = stringOrNull(result?.intentParserSource ?? debug?.intentParserSource ?? plan?.parser?.source);
  const parserReasons = strings(plan?.parser?.reasons); const fastPathMatched = Boolean(debug?.fastPathMatched ?? parserSource === "deterministic");
  const fallbackUsed = Boolean(result?.fallback?.used ?? result?.fallbackUsed ?? debug?.fallbackUsed ?? debug?.deterministicFallbackUsed);
  const suspiciousFlags: string[] = [];
  if (["slow", "critical"].includes(speedStatus)) suspiciousFlags.push("slow"); if (speedStatus === "critical") suspiciousFlags.push("critical_speed"); if (parserSource?.toLowerCase().includes("llm")) suspiciousFlags.push("llm_used"); if (fallbackUsed) suspiciousFlags.push("deterministic_fallback"); if (!counts.displayed) suspiciousFlags.push("no_results"); if (errors.length) suspiciousFlags.push("errors"); if (warnings.length) suspiciousFlags.push("warnings"); if (engine === "compare") suspiciousFlags.push("engine_comparison");
  const needsRestaurant = Boolean(intent?.needsRestaurant ?? intent?.restaurant?.required); const needsActivity = Boolean(intent?.needsActivity ?? intent?.activity?.required); if (needsRestaurant && needsActivity && counts.pairs === 0) suspiciousFlags.push("mixed_no_pairs");
  return { index, query, ok: Boolean(result?.success ?? !errors.length) && errors.length === 0 && !(needsRestaurant && needsActivity && counts.pairs === 0), engine, normalized_search_type: stringOrNull(mode), primary_domain: stringOrNull(domain), restaurant_count: counts.restaurants, activity_count: counts.activities, pair_count: counts.pairs, fallback_pair_count: Number(result?.fallback_pair_count ?? debug?.fallbackPairCount ?? 0), fallbackPairsUsedAsPrimary: Boolean(result?.fallbackPairsUsedAsPrimary ?? debug?.fallbackPairsUsedAsPrimary), primaryResultType: stringOrNull(result?.primaryResultType ?? debug?.primaryResultType), timing_ms: totalMs, speed_status: speedStatus, intentParserSource: parserSource, fastPathMatched, fastPathReason: stringOrNull(debug?.fastPathReason ?? parserReasons.join("; ")), llm_ms: numberOrNull(performance?.llm_ms ?? performance?.llmMs), rpc_ms: numberOrNull(performance?.rpc_ms ?? performance?.rpcMs ?? result?.searchV2?.timing?.retrievalMs ?? result?.timing?.retrievalMs), intent_parse_ms: numberOrNull(performance?.intent_parse_ms ?? performance?.intentParseMs ?? result?.searchV2?.timing?.plannerMs ?? result?.timing?.plannerMs), ranking_ms: numberOrNull(performance?.ranking_ms ?? performance?.rankingMs ?? result?.searchV2?.timing?.scoringMs ?? result?.timing?.scoringMs), result_count: counts.displayed, no_results_reason: stringOrNull(debug?.noResultsReason ?? result?.fallback?.reason), no_pairs_reason: stringOrNull(debug?.noPairsReason), warnings, errors, suspiciousFlags: [...new Set(suspiciousFlags)], activityTerms: strings(debug?.activityTerms ?? intent?.activity?.categories ?? []), restaurantTerms: strings(debug?.restaurantTerms ?? [...asArray(intent?.restaurant?.cuisines), ...asArray(intent?.restaurant?.foods), ...asArray(intent?.restaurant?.features)]), needsRestaurant, needsActivity };
}
function compareWarnings(legacy: any, v2: any) { const left = resultCounts(legacy); const right = resultCounts(v2); return [`Compare: Legacy displayed ${left.displayed}; V2 displayed ${right.displayed}.`, `Compare deltas: restaurants ${right.restaurants - left.restaurants}, activities ${right.activities - left.activities}, pairs ${right.pairs - left.pairs}.`]; }
function requestIdOf(result: any): string | null { return stringOrNull(result?.requestId ?? result?.searchV2?.requestId ?? result?.debug?.requestId); }
export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth); if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({})); const queries = strings(body?.queries).slice(0, clamp(body?.maxQueries, MAX_QUERIES, 1, MAX_QUERIES)); const delayMs = clamp(body?.delayMs, 200, 0, 5000); const includeFullDebug = body?.includeFullDebug !== false; const engine = resolveEngine(request, body);
  if (!queries.length) return NextResponse.json({ ok: false, error: "At least one query is required." }, { status: 400 });
  const run = (query: string, override: "legacy" | "v2", requestId: string) => runOutingSearch({ query, body: { query, requestId, debug: true, includeDebug: true, betaDebug: true }, source: "admin_search_health_batch_qa", route: "/api/admin/search-health/batch-run", userId: auth.adminUser!.user_id, isAdmin: true, authorizedSearchCoreOverride: true, suppressSearchCoreShadow: true, betaDebug: true, searchHealthDebug: true, searchCoreOverride: override });
  const startedAt = new Date(); const summary: any[] = []; const results: any[] = []; let persistedLogCount = 0;
  for (const [index, query] of queries.entries()) {
    const queryStarted = Date.now(); let row: any; let resultForLog: any;
    try {
      if (engine === "compare") {
        const requestId = crypto.randomUUID(); const [legacy, v2] = await Promise.all([run(query, "legacy", `${requestId}:legacy`).catch((error) => ({ success: false, error: error instanceof Error ? error.message : String(error) })), run(query, "v2", `${requestId}:v2`).catch((error) => ({ success: false, error: error instanceof Error ? error.message : String(error) }))]);
        const comparison = { success: Boolean(legacy?.success || v2?.success), comparisonMode: true, searchCoreOverride: "compare", legacy, v2, comparison: { legacyCounts: resultCounts(legacy), v2Counts: resultCounts(v2) } };
        resultForLog = v2?.success ? v2 : legacy; row = buildSummary(index, query, engine, resultForLog, Date.now() - queryStarted, compareWarnings(legacy, v2)); await persistQaSearchLog(row, requestIdOf(resultForLog) ?? requestId); persistedLogCount++; summary.push(row); results.push(includeFullDebug ? { index, query, summary: row, result: comparison } : { index, query, summary: row });
      } else {
        const requestedId = crypto.randomUUID(); const result = await run(query, engine, requestedId); resultForLog = result; row = buildSummary(index, query, engine, result, Date.now() - queryStarted); await persistQaSearchLog(row, requestIdOf(result) ?? requestedId); persistedLogCount++; summary.push(row); results.push(includeFullDebug ? { index, query, summary: row, result } : { index, query, summary: row });
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("QA search log failed:")) return NextResponse.json({ ok: false, error: error.message, failedQuery: query, failedIndex: index, persistedLogCount, expectedLogCount: queries.length, summary, results }, { status: 500 });
      const failure = { success: false, error: error instanceof Error ? error.message : String(error) }; row = buildSummary(index, query, engine, failure, Date.now() - queryStarted, [], error);
      try { await persistQaSearchLog(row, null); persistedLogCount++; } catch (logError) { return NextResponse.json({ ok: false, error: logError instanceof Error ? logError.message : "QA search log failed", failedQuery: query, failedIndex: index, persistedLogCount, expectedLogCount: queries.length, summary, results }, { status: 500 }); }
      summary.push(row); results.push(includeFullDebug ? { index, query, summary: row, result: failure } : { index, query, summary: row });
    }
    if (index < queries.length - 1 && delayMs > 0) await sleep(delayMs);
  }
  const finishedAt = new Date(); return NextResponse.json({ ok: true, engine, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), count: summary.length, persistedLogCount, expectedLogCount: queries.length, summary, results });
}
