import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { createPublicSearchController } from "@/lib/search/public-api/controller";
import { persistQaSearchLog } from "@/lib/search/quality/qaSearchLog";
import { evaluateSearchAcceptanceContracts } from "@/lib/search/quality/searchAcceptanceContracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERIES = 100;
const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const strings = (value: unknown): string[] => asArray(value).map((item) => String(item ?? "").trim()).filter(Boolean);
const numberOrNull = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const stringOrNull = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.trunc(numeric))) : fallback;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function countsOf(result: any) {
  const restaurants = asArray(result?.restaurants).length;
  const activities = asArray(result?.activities).length;
  const pairs = asArray(result?.pairs).length;
  const cards = asArray(result?.cards).length;
  return { restaurants, activities, pairs, displayed: cards || restaurants + activities + pairs };
}

function buildSummary(index: number, query: string, result: any, elapsedMs: number, caughtError?: unknown) {
  const debug = result?.debug ?? {};
  const intent = debug?.normalizedIntent ?? result?.normalizedIntent ?? result?.searchV2?.searchPlan ?? {};
  const performance = result?.searchPerformance ?? debug?.performance ?? result?.timing ?? {};
  const counts = countsOf(result);
  const errors = [
    ...strings(result?.errors),
    ...strings(debug?.errors),
    ...(result?.error ? [String(result.error)] : []),
    ...(caughtError instanceof Error ? [caughtError.message] : caughtError ? [String(caughtError)] : []),
  ];
  const warnings = [...strings(result?.warnings), ...strings(debug?.warnings)];
  const acceptance = evaluateSearchAcceptanceContracts({ result: { ...result, query }, errors, warnings, counts });
  const totalMs = numberOrNull(performance?.total_ms ?? performance?.totalMs ?? result?.timing_ms) ?? elapsedMs;
  const suspiciousFlags = [
    ...(errors.length ? ["errors"] : []),
    ...(warnings.length ? ["warnings"] : []),
    ...(!acceptance.intent.passed ? ["intent_contract_failed"] : []),
    ...(!acceptance.geoAnchor.passed ? ["geo_anchor_contract_failed"] : []),
    ...(!acceptance.retrieval.passed ? ["retrieval_contract_failed"] : []),
    ...(!acceptance.pairing.passed ? ["pairing_contract_failed"] : []),
    ...(result?.assignedEngine !== "v2" ? ["unexpected_engine"] : []),
  ];
  return {
    index,
    query,
    ok: acceptance.testPassed,
    testPassed: acceptance.testPassed,
    engine: "public",
    assignedEngine: stringOrNull(result?.assignedEngine ?? debug?.assignedEngine),
    searchCoreAssignment: result?.searchCoreAssignment ?? debug?.searchCoreAssignment ?? null,
    executionPath: "/api/generate",
    requestId: stringOrNull(result?.requestId ?? debug?.requestId),
    outcome: stringOrNull(result?.outcome ?? debug?.outcome),
    requestFulfilled: acceptance.qa.evidence.requestFulfilled === true,
    contracts: acceptance,
    intentPassed: acceptance.intent.passed,
    geoAnchorPassed: acceptance.geoAnchor.passed,
    retrievalPassed: acceptance.retrieval.passed,
    pairingPassed: acceptance.pairing.passed,
    outcomePassed: acceptance.qa.passed,
    normalized_search_type: stringOrNull(intent?.searchType ?? intent?.mode ?? result?.search_type ?? result?.searchType),
    primary_domain: stringOrNull(intent?.primaryDomain ?? result?.primary_domain ?? result?.primaryDomain),
    restaurant_count: counts.restaurants,
    activity_count: counts.activities,
    pair_count: counts.pairs,
    result_count: counts.displayed,
    render_mode: stringOrNull(result?.render_mode ?? result?.renderMode),
    timing_ms: totalMs,
    intentParserSource: stringOrNull(debug?.intentParserSource ?? intent?.parser?.source),
    rawActivityCandidateCount: numberOrNull(debug?.rawActivityCandidateCount ?? result?.searchV2?.retrieval?.activityCandidateCount),
    pairCandidatesEvaluated: numberOrNull(debug?.searchTelemetry?.pairCandidatesEvaluated ?? debug?.pairingDebug?.pairCandidatesEvaluated ?? result?.searchTelemetry?.pairCandidatesEvaluated),
    warnings,
    errors,
    suspiciousFlags: [...new Set(suspiciousFlags)],
    needsRestaurant: Boolean(intent?.needsRestaurant ?? intent?.restaurant?.required),
    needsActivity: Boolean(intent?.needsActivity ?? intent?.activity?.required),
  };
}

function createQaPublicController(adminUser: { user_id: string; email?: string | null }) {
  return createPublicSearchController({
    getIdentity: async () => ({ user: { id: adminUser.user_id, email: adminUser.email ?? null }, guestId: null, setGuestCookie: false }) as any,
    checkLimit: async () => ({
      allowed: true,
      settings: { enabled: false },
      plan: { planKey: "admin_qa", unlimited: true, isBeta: false, isAdmin: true },
      usedThisWeek: 0,
      weeklyLimit: null,
      message: null,
    }) as any,
    recordUsage: async () => undefined,
    logAnalytics: async () => undefined,
    logSearchHealth: async () => undefined,
    logRouteTiming: () => undefined,
  });
}

async function runPublicQaSearch(
  controller: ReturnType<typeof createPublicSearchController>,
  sourceRequest: NextRequest,
  query: string,
  requestId: string,
) {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("x-request-id", requestId);
  const authorization = sourceRequest.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const request = new Request("http://internal/api/generate", {
    method: "POST",
    headers,
    body: JSON.stringify({
      query,
      message: query,
      requestId,
      selectedSearchLane: "auto",
      debug: true,
      includeDebug: true,
      betaDebug: true,
      searchHealthDebug: true,
      qaPublicParity: true,
    }),
  });
  const response = await controller(request);
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") throw new Error(`Public search returned an unreadable response (${response.status}).`);
  if (!response.ok && !payload.success) throw new Error(payload?.error?.message ?? payload?.error ?? `Public search failed (${response.status}).`);
  return payload;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const queries = strings(body?.queries).slice(0, clamp(body?.maxQueries, MAX_QUERIES, 1, MAX_QUERIES));
  const delayMs = clamp(body?.delayMs, 200, 0, 5000);
  const includeFullDebug = body?.includeFullDebug !== false;
  if (!queries.length) return NextResponse.json({ ok: false, error: "At least one query is required." }, { status: 400 });
  const controller = createQaPublicController(auth.adminUser!);
  const startedAt = new Date();
  const summary: any[] = [];
  const results: any[] = [];
  let persistedLogCount = 0;
  for (const [index, query] of queries.entries()) {
    const queryStarted = Date.now();
    const requestId = crypto.randomUUID();
    let result: any;
    let row: any;
    try {
      result = await runPublicQaSearch(controller, request, query, requestId);
      row = buildSummary(index, query, result, Date.now() - queryStarted);
    } catch (error) {
      result = { success: false, requestId, error: error instanceof Error ? error.message : String(error) };
      row = buildSummary(index, query, result, Date.now() - queryStarted, error);
    }
    try {
      await persistQaSearchLog(row, row.requestId ?? requestId);
      persistedLogCount += 1;
    } catch (logError) {
      return NextResponse.json({
        ok: false,
        error: logError instanceof Error ? logError.message : "QA search log failed",
        failedQuery: query,
        failedIndex: index,
        persistedLogCount,
        expectedLogCount: queries.length,
        summary,
        results,
      }, { status: 500 });
    }
    summary.push(row);
    results.push(includeFullDebug ? { index, query, summary: row, result } : { index, query, summary: row });
    if (index < queries.length - 1 && delayMs > 0) await sleep(delayMs);
  }
  const finishedAt = new Date();
  const passedCount = summary.filter((row) => row.testPassed === true).length;
  const failedCount = summary.length - passedCount;
  return NextResponse.json({
    ok: true,
    executionSucceeded: true,
    allPassed: failedCount === 0,
    engine: "public",
    assignedEngine: "v2",
    executionPath: "/api/generate",
    parityMode: true,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    count: summary.length,
    passedCount,
    failedCount,
    persistedLogCount,
    expectedLogCount: queries.length,
    summary,
    results,
  });
}
