import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { createPublicSearchController } from "@/lib/search/public-api/controller";
import { persistQaSearchLog } from "@/lib/search/quality/qaSearchLog";
import { evaluateSearchAcceptanceContracts } from "@/lib/search/quality/searchAcceptanceContracts";
import { normalizeQaDiagnosisSummary } from "@/lib/search/quality/normalizeQaDiagnosisSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERIES = 100;
const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => asArray(value).map((item) => String(item ?? "").trim()).filter(Boolean);
const numberOrNull = (value: unknown): number | null => { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : null; };
const stringOrNull = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const clamp = (value: unknown, fallback: number, min: number, max: number) => { const numeric = Number(value); return Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.trunc(numeric))) : fallback; };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function countsOf(result: any) {
  const restaurants = asArray(result?.restaurants).length;
  const activities = asArray(result?.activities).length;
  const pairs = asArray(result?.pairs).length;
  const cards = asArray(result?.cards).length;
  return { restaurants, activities, pairs, displayed: cards || restaurants + activities + pairs };
}
function speedStatus(totalMs: number | null): "fast" | "good" | "slow" | "critical" | null {
  if (totalMs == null) return null;
  if (totalMs < 1000) return "fast";
  if (totalMs < 2000) return "good";
  if (totalMs < 4000) return "slow";
  return "critical";
}
function firstNumber(...values: unknown[]) {
  for (const value of values) { const numeric = numberOrNull(value); if (numeric != null) return numeric; }
  return null;
}

function buildSummary(index: number, query: string, result: any, elapsedMs: number, caughtError?: unknown) {
  const debug = result?.debug ?? {};
  const intent = debug?.normalizedIntent ?? result?.normalizedIntent ?? result?.searchV2?.searchPlan ?? {};
  const timing = result?.timing ?? result?.searchV2?.timing ?? debug?.timing ?? debug?.performance ?? result?.searchPerformance ?? {};
  const pairingDebug = debug?.pairingDebug ?? result?.searchV2?.pairingDebug ?? result?.pairingDebug ?? {};
  const counts = countsOf(result);
  const errors = [...strings(result?.errors), ...strings(debug?.errors), ...(result?.error ? [String(result.error)] : []), ...(caughtError instanceof Error ? [caughtError.message] : caughtError ? [String(caughtError)] : [])];
  const warnings = [...strings(result?.warnings), ...strings(debug?.warnings)];
  const acceptance = evaluateSearchAcceptanceContracts({ result: { ...result, query }, errors, warnings, counts });
  const normalizedTruth = normalizeQaDiagnosisSummary({ diagnosis: acceptance.diagnosis, result });
  const totalMs = firstNumber(timing?.totalMs, timing?.total_ms, result?.timing_ms) ?? elapsedMs;
  const currentSpeedStatus = speedStatus(totalMs);
  const parserSource = stringOrNull(debug?.intentParserSource ?? intent?.parser?.source);
  const llmMs = firstNumber(timing?.llmMs, timing?.llm_ms, debug?.llm_ms, result?.llm_ms);
  const rpcMs = firstNumber(timing?.rpcMs, timing?.rpc_ms, debug?.rpc_ms, result?.rpc_ms);
  const intentParseMs = firstNumber(timing?.intentParsingMs, timing?.intentParseMs, timing?.intent_parse_ms, debug?.intent_parse_ms);
  const restaurantRetrievalMs = firstNumber(timing?.restaurantRetrievalMs, timing?.restaurant_retrieval_ms);
  const activityRetrievalMs = firstNumber(timing?.activityRetrievalMs, timing?.activity_retrieval_ms);
  const pairingMs = firstNumber(timing?.pairingMs, timing?.pairing_ms);
  const rankingMs = firstNumber(timing?.rankingMs, timing?.ranking_ms, timing?.scoringMs, debug?.ranking_ms);
  const responseAdaptationMs = firstNumber(timing?.responseAdaptationMs, timing?.response_adaptation_ms, timing?.serializationMs);
  const llmUsed = (llmMs != null && llmMs > 0) || parserSource === "llm";
  const fastPathMatched = Boolean(result?.fastPathMatched ?? debug?.fastPathMatched ?? debug?.fastPath?.matched ?? result?.searchV2?.fastPathMatched);
  const fastPathReason = stringOrNull(result?.fastPathReason ?? debug?.fastPathReason ?? debug?.fastPath?.reason);
  const fallbackUsed = Boolean(result?.fallbackDiagnostics?.used ?? result?.searchV2?.fallback?.used ?? debug?.fallback?.used);
  const fallbackReason = stringOrNull(result?.fallbackDiagnostics?.reason ?? result?.searchV2?.fallback?.reason ?? debug?.fallback?.reason);
  const normalizedSearchType = stringOrNull(intent?.searchType ?? intent?.mode ?? result?.search_type ?? result?.searchType);
  const primaryDomain = stringOrNull(intent?.primaryDomain ?? result?.primary_domain ?? result?.primaryDomain);
  const noResults = counts.displayed === 0;
  const mixedNoPairs = (primaryDomain === "mixed" || normalizedSearchType === "paired_outing" || normalizedSearchType === "same_venue") && counts.pairs === 0;
  const noResultsReason = noResults ? stringOrNull(result?.no_results_reason ?? debug?.no_results_reason ?? normalizedTruth.outcome ?? fallbackReason) ?? "no_renderable_results" : null;
  const noPairsReason = mixedNoPairs ? normalizedTruth.diagnosisClassification ?? stringOrNull(result?.no_pairs_reason ?? pairingDebug?.primaryFailure ?? normalizedTruth.outcome ?? fallbackReason) ?? "no_valid_pair" : null;
  const suspiciousFlags = [
    ...(errors.length ? ["errors"] : []), ...(warnings.length ? ["warnings"] : []), ...(currentSpeedStatus === "slow" ? ["slow"] : []), ...(currentSpeedStatus === "critical" ? ["critical_speed"] : []), ...(llmUsed ? ["llm_used"] : []), ...(fallbackUsed ? ["deterministic_fallback"] : []), ...(noResults ? ["no_results"] : []), ...(mixedNoPairs ? ["mixed_no_pairs"] : []),
    ...(normalizedTruth.diagnosisClassification === "activity_evidence_gap" ? ["activity_evidence_gap"] : []), ...(normalizedTruth.diagnosisClassification === "restaurant_evidence_gap" ? ["restaurant_evidence_gap"] : []), ...(normalizedTruth.diagnosisClassification === "no_compatible_pair" ? ["no_compatible_pair"] : []),
    ...(!acceptance.intent.passed ? ["intent_contract_failed"] : []), ...(!acceptance.geoAnchor.passed ? ["geo_anchor_contract_failed"] : []), ...(!acceptance.retrieval.passed ? ["retrieval_contract_failed"] : []), ...(!acceptance.pairing.passed ? ["pairing_contract_failed"] : []), ...(result?.assignedEngine !== "v2" ? ["unexpected_engine"] : []),
  ];
  return {
    index, query, ok: acceptance.testPassed, testPassed: acceptance.testPassed, engine: "public",
    assignedEngine: stringOrNull(result?.assignedEngine ?? debug?.assignedEngine), searchCoreAssignment: result?.searchCoreAssignment ?? debug?.searchCoreAssignment ?? null, executionPath: "/api/generate", requestId: stringOrNull(result?.requestId ?? debug?.requestId),
    outcome: normalizedTruth.outcome, requestFulfilled: normalizedTruth.requestFulfilled, partialResults: normalizedTruth.partialResults, diagnosis: normalizedTruth.diagnosisClassification, diagnosisDetails: normalizedTruth.diagnosis, contracts: acceptance,
    intentPassed: acceptance.intent.passed, geoAnchorPassed: acceptance.geoAnchor.passed, retrievalPassed: acceptance.retrieval.passed, pairingPassed: acceptance.pairing.passed, outcomePassed: acceptance.qa.passed,
    normalized_search_type: normalizedSearchType, primary_domain: primaryDomain, restaurant_count: counts.restaurants, activity_count: counts.activities, pair_count: counts.pairs,
    fallback_pair_count: firstNumber(result?.fallback_pair_count, debug?.fallbackPairCount) ?? 0, fallbackPairsUsedAsPrimary: Boolean(result?.fallbackPairsUsedAsPrimary ?? debug?.fallbackPairsUsedAsPrimary), primaryResultType: normalizedTruth.primaryResultType, result_count: counts.displayed, render_mode: normalizedTruth.renderMode,
    timing_ms: totalMs, speed_status: currentSpeedStatus, intentParserSource: parserSource, fastPathMatched, fastPathReason, llm_ms: llmMs, rpc_ms: rpcMs,
    intent_parse_ms: intentParseMs, restaurant_retrieval_ms: restaurantRetrievalMs, activity_retrieval_ms: activityRetrievalMs, pairing_ms: pairingMs, ranking_ms: rankingMs, response_adaptation_ms: responseAdaptationMs,
    no_results_reason: noResultsReason, no_pairs_reason: noPairsReason,
    rawActivityCandidateCount: firstNumber(debug?.rawActivityCandidateCount, result?.searchV2?.retrieval?.activityCandidateCount),
    theoreticalPairCandidates: firstNumber(pairingDebug?.theoreticalPairCandidates), pairCandidatesEvaluated: firstNumber(pairingDebug?.pairCandidatesEvaluated, debug?.searchTelemetry?.pairCandidatesEvaluated, result?.searchTelemetry?.pairCandidatesEvaluated), pairCandidatesSkipped: firstNumber(pairingDebug?.pairCandidatesSkipped), shortCircuitApplied: Boolean(pairingDebug?.shortCircuitApplied), shortCircuitReason: stringOrNull(pairingDebug?.shortCircuitReason),
    adaptiveExpansionApplied: Boolean(pairingDebug?.adaptiveExpansionApplied), adaptiveRestaurantLimit: firstNumber(pairingDebug?.adaptiveRestaurantLimit), adaptiveActivityLimit: firstNumber(pairingDebug?.adaptiveActivityLimit), initialRestaurantLimit: firstNumber(pairingDebug?.initialRestaurantLimit), initialActivityLimit: firstNumber(pairingDebug?.initialActivityLimit),
    warnings, errors, suspiciousFlags: [...new Set(suspiciousFlags)], needsRestaurant: Boolean(intent?.needsRestaurant ?? intent?.restaurant?.required), needsActivity: Boolean(intent?.needsActivity ?? intent?.activity?.required), activityTerms: strings(intent?.activityTerms ?? intent?.activity?.terms), restaurantTerms: strings(intent?.restaurantTerms ?? intent?.restaurant?.terms),
  };
}

function createQaPublicController(adminUser: { user_id: string; email?: string | null }) {
  return createPublicSearchController({
    getIdentity: async () => ({ user: { id: adminUser.user_id, email: adminUser.email ?? null }, guestId: null, setGuestCookie: false }) as any,
    checkLimit: async () => ({ allowed: true, settings: { enabled: false }, plan: { planKey: "admin_qa", unlimited: true, isBeta: false, isAdmin: true }, usedThisWeek: 0, weeklyLimit: null, message: null }) as any,
    recordUsage: async () => undefined, logAnalytics: async () => ({ ok: true }), logSearchHealth: async () => ({ ok: true }), logRouteTiming: () => undefined,
  });
}
async function runPublicQaSearch(controller: ReturnType<typeof createPublicSearchController>, sourceRequest: NextRequest, query: string, requestId: string) {
  const headers = new Headers(); headers.set("content-type", "application/json"); headers.set("x-request-id", requestId);
  const authorization = sourceRequest.headers.get("authorization"); if (authorization) headers.set("authorization", authorization);
  const request = new Request("http://internal/api/generate", { method: "POST", headers, body: JSON.stringify({ query, message: query, requestId, selectedSearchLane: "auto", debug: true, includeDebug: true, betaDebug: true, searchHealthDebug: true, qaPublicParity: true }) });
  const response = await controller(request); const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") throw new Error(`Public search returned an unreadable response (${response.status}).`);
  if (!response.ok && !payload.success) throw new Error(payload?.error?.message ?? payload?.error ?? `Public search failed (${response.status}).`);
  return payload;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth); if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const queries = strings(body?.queries).slice(0, clamp(body?.maxQueries, MAX_QUERIES, 1, MAX_QUERIES));
  const delayMs = clamp(body?.delayMs, 200, 0, 5000); const includeFullDebug = body?.includeFullDebug !== false;
  if (!queries.length) return NextResponse.json({ ok: false, error: "At least one query is required." }, { status: 400 });
  const controller = createQaPublicController(auth.adminUser!); const startedAt = new Date(); const summary: any[] = []; const results: any[] = []; let persistedLogCount = 0;
  for (const [index, query] of queries.entries()) {
    const queryStarted = Date.now(); const requestId = crypto.randomUUID(); let result: any; let row: any;
    try { result = await runPublicQaSearch(controller, request, query, requestId); row = buildSummary(index, query, result, Date.now() - queryStarted); }
    catch (error) { result = { success: false, requestId, error: error instanceof Error ? error.message : String(error) }; row = buildSummary(index, query, result, Date.now() - queryStarted, error); }
    try { await persistQaSearchLog(row, row.requestId ?? requestId); persistedLogCount += 1; }
    catch (logError) { return NextResponse.json({ ok: false, error: logError instanceof Error ? logError.message : "QA search log failed", failedQuery: query, failedIndex: index, persistedLogCount, expectedLogCount: queries.length, summary, results }, { status: 500 }); }
    summary.push(row); results.push(includeFullDebug ? { index, query, summary: row, result } : { index, query, summary: row });
    if (index < queries.length - 1 && delayMs > 0) await sleep(delayMs);
  }
  const finishedAt = new Date(); const passedCount = summary.filter((row) => row.testPassed === true).length; const failedCount = summary.length - passedCount;
  return NextResponse.json({ ok: true, executionSucceeded: true, allPassed: failedCount === 0, engine: "public", assignedEngine: "v2", executionPath: "/api/generate", parityMode: true, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), count: summary.length, passedCount, failedCount, persistedLogCount, expectedLogCount: queries.length, summary, results });
}
