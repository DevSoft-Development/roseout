import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runOutingSearch } from "@/lib/search/runSearch";
import type { SearchCoreOverride } from "@/lib/search/searchCoreConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINES = new Set<SearchCoreOverride>(["legacy", "v2", "compare"]);
const MAX_QUERIES = 100;

type QaEngine = "legacy" | "v2" | "compare";

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return asArray(value).map((item) => String(item ?? "").trim()).filter(Boolean);
}

function numberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(max, Math.max(min, Math.trunc(numeric)))
    : fallback;
}

function resolveEngine(request: NextRequest, body: any): QaEngine {
  const value = String(
    body?.searchCoreOverride ??
      request.cookies.get("search_qa_engine")?.value ??
      "legacy",
  ).toLowerCase() as SearchCoreOverride;
  return ENGINES.has(value) ? (value as QaEngine) : "legacy";
}

function debugOf(result: any) {
  return result?.debug ?? result?.diagnostics?.debug ?? {};
}

function intentOf(result: any) {
  const debug = debugOf(result);
  return (
    result?.parsedIntent ??
    debug?.normalizedIntent ??
    result?.searchV2?.searchPlan ??
    result?.searchPlan ??
    {}
  );
}

function performanceOf(result: any) {
  const debug = debugOf(result);
  return (
    result?.performance ??
    result?.searchPerformance ??
    debug?.performance ??
    result?.searchV2?.timing ??
    result?.timing ??
    {}
  );
}

function resultCounts(result: any) {
  const canonical =
    result?.searchV2?.counts ?? result?.counts ?? result?.debug?.canonicalCounts ?? {};
  const restaurantCards = asArray(
    result?.restaurantCards ??
      (Array.isArray(result?.restaurants) ? result.restaurants : []),
  );
  const activityCards = asArray(
    result?.activityCards ??
      (Array.isArray(result?.activities) ? result.activities : []),
  );
  const pairCards = asArray(
    result?.pairCards ?? (Array.isArray(result?.pairs) ? result.pairs : []),
  );
  const restaurants = Number(
    canonical.restaurantCards ??
      result?.restaurant_count ??
      (typeof result?.restaurants === "number"
        ? result.restaurants
        : restaurantCards.length),
  );
  const activities = Number(
    canonical.activityCards ??
      result?.activity_count ??
      (typeof result?.activities === "number"
        ? result.activities
        : activityCards.length),
  );
  const pairs = Number(
    canonical.pairs ??
      result?.pair_count ??
      (typeof result?.pairs === "number" ? result.pairs : pairCards.length),
  );
  const displayed = Number(
    canonical.displayedResults ??
      result?.result_count ??
      (pairs || restaurants + activities),
  );
  return { restaurants, activities, pairs, displayed };
}

function buildSummary(
  index: number,
  query: string,
  engine: QaEngine,
  result: any,
  elapsedMs: number,
  extraWarnings: string[] = [],
  caughtError?: unknown,
) {
  const debug = debugOf(result);
  const intent = intentOf(result);
  const performance = performanceOf(result);
  const counts = resultCounts(result);
  const errors = [
    ...strings(result?.errors),
    ...strings(debug?.errors),
    ...(result?.error ? [String(result.error)] : []),
    ...(caughtError instanceof Error
      ? [caughtError.message]
      : caughtError
        ? [String(caughtError)]
        : []),
  ];
  const warnings = [
    ...strings(result?.warnings),
    ...strings(debug?.warnings),
    ...extraWarnings,
  ];
  const mode =
    result?.searchV2?.requestedMode ??
    result?.searchPlan?.mode ??
    result?.search_type ??
    result?.searchType ??
    intent?.searchType ??
    intent?.search_type ??
    result?.render_mode ??
    result?.renderMode;
  const domain =
    result?.primary_domain ??
    result?.primaryDomain ??
    intent?.primaryDomain ??
    intent?.primary_domain;
  const speedStatus = stringOrNull(
    performance?.speed_status ?? performance?.speedStatus,
  );
  const suspiciousFlags: string[] = [];
  if (speedStatus === "slow" || speedStatus === "critical") suspiciousFlags.push("slow");
  if (speedStatus === "critical") suspiciousFlags.push("critical_speed");
  if (!counts.displayed) suspiciousFlags.push("no_results");
  if (errors.length) suspiciousFlags.push("errors");
  if (warnings.length) suspiciousFlags.push("warnings");
  if (engine === "compare") suspiciousFlags.push("engine_comparison");

  return {
    index,
    query,
    ok: Boolean(result?.success ?? !errors.length) && errors.length === 0,
    engine,
    normalized_search_type: stringOrNull(mode),
    primary_domain: stringOrNull(domain),
    restaurant_count: counts.restaurants,
    activity_count: counts.activities,
    pair_count: counts.pairs,
    fallback_pair_count: Number(
      result?.fallback_pair_count ?? debug?.fallbackPairCount ?? 0,
    ),
    fallbackPairsUsedAsPrimary: Boolean(
      result?.fallbackPairsUsedAsPrimary ?? debug?.fallbackPairsUsedAsPrimary,
    ),
    primaryResultType: stringOrNull(
      result?.primaryResultType ?? debug?.primaryResultType,
    ),
    timing_ms:
      numberOrNull(
        performance?.total_ms ??
          performance?.totalMs ??
          result?.searchV2?.timing?.totalMs ??
          result?.timing?.totalMs,
      ) ?? elapsedMs,
    speed_status: speedStatus,
    intentParserSource: stringOrNull(
      result?.intentParserSource ?? debug?.intentParserSource,
    ),
    fastPathMatched: Boolean(debug?.fastPathMatched),
    fastPathReason: stringOrNull(debug?.fastPathReason),
    llm_ms: numberOrNull(performance?.llm_ms ?? performance?.llmMs),
    rpc_ms: numberOrNull(performance?.rpc_ms ?? performance?.rpcMs),
    intent_parse_ms: numberOrNull(
      performance?.intent_parse_ms ?? performance?.intentParseMs,
    ),
    ranking_ms: numberOrNull(
      performance?.ranking_ms ?? performance?.rankingMs,
    ),
    result_count: counts.displayed,
    no_results_reason: stringOrNull(
      debug?.noResultsReason ?? result?.fallback?.reason,
    ),
    no_pairs_reason: stringOrNull(debug?.noPairsReason),
    warnings,
    errors,
    suspiciousFlags,
    activityTerms: strings(
      debug?.activityTerms ?? intent?.activity?.categories ?? [],
    ),
    restaurantTerms: strings(
      debug?.restaurantTerms ?? [
        ...asArray(intent?.restaurant?.cuisines),
        ...asArray(intent?.restaurant?.foods),
        ...asArray(intent?.restaurant?.features),
      ],
    ),
    needsRestaurant: Boolean(
      intent?.needsRestaurant ?? intent?.restaurant?.required,
    ),
    needsActivity: Boolean(
      intent?.needsActivity ?? intent?.activity?.required,
    ),
  };
}

function compareWarnings(legacy: any, v2: any) {
  const left = resultCounts(legacy);
  const right = resultCounts(v2);
  return [
    `Compare: Legacy displayed ${left.displayed}; V2 displayed ${right.displayed}.`,
    `Compare deltas: restaurants ${right.restaurants - left.restaurants}, activities ${right.activities - left.activities}, pairs ${right.pairs - left.pairs}.`,
  ];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const queries = strings(body?.queries).slice(
    0,
    clamp(body?.maxQueries, MAX_QUERIES, 1, MAX_QUERIES),
  );
  const delayMs = clamp(body?.delayMs, 200, 0, 5000);
  const includeFullDebug = body?.includeFullDebug !== false;
  const engine = resolveEngine(request, body);

  if (!queries.length) {
    return NextResponse.json(
      { ok: false, error: "At least one query is required." },
      { status: 400 },
    );
  }

  const run = (
    query: string,
    override: "legacy" | "v2",
    requestId: string,
  ) =>
    runOutingSearch({
      query,
      body: { query, requestId, debug: true, includeDebug: true, betaDebug: true },
      source: "admin_search_health_batch_qa",
      route: "/api/admin/search-health/batch-run",
      userId: auth.adminUser!.user_id,
      isAdmin: true,
      authorizedSearchCoreOverride: true,
      suppressSearchCoreShadow: true,
      betaDebug: true,
      searchHealthDebug: true,
      searchCoreOverride: override,
    });

  const startedAt = new Date();
  const summary: any[] = [];
  const results: any[] = [];

  for (const [index, query] of queries.entries()) {
    const queryStarted = Date.now();
    try {
      if (engine === "compare") {
        const requestId = crypto.randomUUID();
        const [legacy, v2] = await Promise.all([
          run(query, "legacy", `${requestId}:legacy`).catch((error) => ({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          })),
          run(query, "v2", `${requestId}:v2`).catch((error) => ({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          })),
        ]);
        const comparison = {
          success: Boolean(legacy?.success || v2?.success),
          comparisonMode: true,
          searchCoreOverride: "compare",
          legacy,
          v2,
          comparison: {
            legacyCounts: resultCounts(legacy),
            v2Counts: resultCounts(v2),
          },
        };
        const row = buildSummary(
          index,
          query,
          engine,
          v2?.success ? v2 : legacy,
          Date.now() - queryStarted,
          compareWarnings(legacy, v2),
        );
        summary.push(row);
        results.push(
          includeFullDebug
            ? { index, query, summary: row, result: comparison }
            : { index, query, summary: row },
        );
      } else {
        const result = await run(query, engine, crypto.randomUUID());
        const row = buildSummary(
          index,
          query,
          engine,
          result,
          Date.now() - queryStarted,
        );
        summary.push(row);
        results.push(
          includeFullDebug
            ? { index, query, summary: row, result }
            : { index, query, summary: row },
        );
      }
    } catch (error) {
      const failure = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      const row = buildSummary(
        index,
        query,
        engine,
        failure,
        Date.now() - queryStarted,
        [],
        error,
      );
      summary.push(row);
      results.push(
        includeFullDebug
          ? { index, query, summary: row, result: failure }
          : { index, query, summary: row },
      );
    }

    if (index < queries.length - 1 && delayMs > 0) await sleep(delayMs);
  }

  const finishedAt = new Date();
  return NextResponse.json({
    ok: true,
    engine,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    count: summary.length,
    summary,
    results,
  });
}
