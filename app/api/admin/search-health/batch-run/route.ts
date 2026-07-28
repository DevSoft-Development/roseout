import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runOutingSearch } from "@/lib/search/runSearch";
import type { SearchCoreOverride } from "@/lib/search/searchCoreConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DELAY_MS = 200;
const MAX_QUERIES = 100;
const MAX_DELAY_MS = 5000;
const ENGINES = new Set<SearchCoreOverride>(["legacy", "v2", "compare"]);

type QaEngine = "legacy" | "v2" | "compare";

type QaSummary = {
  index: number;
  query: string;
  ok: boolean;
  normalized_search_type: string | null;
  primary_domain: string | null;
  restaurant_count: number;
  activity_count: number;
  pair_count: number;
  fallback_pair_count?: number;
  fallbackPairsUsedAsPrimary?: boolean;
  primaryResultType?: string | null;
  timing_ms: number | null;
  speed_status: string | null;
  intentParserSource: string | null;
  fastPathMatched: boolean;
  fastPathReason: string | null;
  llm_ms: number | null;
  rpc_ms: number | null;
  intent_parse_ms: number | null;
  ranking_ms: number | null;
  result_count: number;
  no_results_reason: string | null;
  no_pairs_reason: string | null;
  warnings: string[];
  errors: string[];
  suspiciousFlags: string[];
  activityTerms: string[];
  restaurantTerms: string[];
  needsRestaurant: boolean;
  needsActivity: boolean;
  engine: QaEngine;
};

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function numberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function selectedEngine(request: NextRequest, body: any): QaEngine {
  const requested = String(
    body?.searchCoreOverride ??
      request.cookies.get("search_qa_engine")?.value ??
      "legacy",
  ).toLowerCase() as SearchCoreOverride;
  return ENGINES.has(requested) ? (requested as QaEngine) : "legacy";
}

function getDebug(result: any) {
  return result?.debug ?? result?.diagnostics?.debug ?? {};
}

function getIntent(result: any) {
  const debug = getDebug(result);
  return (
    result?.parsedIntent ??
    debug?.normalizedIntent ??
    debug?.parsedIntent ??
    result?.searchV2?.searchPlan ??
    result?.searchPlan ??
    {}
  );
}

function counts(result: any) {
  const canonical =
    result?.searchV2?.counts ??
    result?.counts ??
    result?.debug?.canonicalCounts ??
    {};
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
  const restaurantCount = Number(
    canonical.restaurantCards ??
      result?.restaurant_count ??
      (typeof result?.restaurants === "number"
        ? result.restaurants
        : restaurantCards.length),
  );
  const activityCount = Number(
    canonical.activityCards ??
      result?.activity_count ??
      (typeof result?.activities === "number"
        ? result.activities
        : activityCards.length),
  );
  const pairCount = Number(
    canonical.pairs ??
      result?.pair_count ??
      (typeof result?.pairs === "number" ? result.pairs : pairCards.length),
  );
  const displayed = Number(
    canonical.displayedResults ??
      result?.result_count ??
      pairCount ||
      restaurantCount + activityCount,
  );
  return { restaurantCount, activityCount, pairCount, displayed };
}

function performance(result: any) {
  const debug = getDebug(result);
  return (
    result?.performance ??
    result?.searchPerformance ??
    debug?.performance ??
    result?.searchV2?.timing ??
    result?.timing ??
    {}
  );
}

function buildSummary(
  index: number,
  query: string,
  engine: QaEngine,
  result: any,
  fallbackMs: number,
  extraWarnings: string[] = [],
  caughtError?: unknown,
): QaSummary {
  const debug = getDebug(result);
  const intent = getIntent(result);
  const metric = performance(result);
  const valueCounts = counts(result);
  const errors = [
    ...stringArray(result?.errors),
    ...stringArray(debug?.errors),
    ...(result?.error ? [String(result.error)] : []),
    ...(caughtError instanceof Error
      ? [caughtError.message]
      : caughtError
        ? [String(caughtError)]
        : []),
  ];
  const warnings = [
    ...stringArray(result?.warnings),
    ...stringArray(debug?.warnings),
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
  const timingMs =
    numberOrNull(
      metric?.total_ms ??
        metric?.totalMs ??
        result?.searchV2?.timing?.totalMs ??
        result?.timing?.totalMs,
    ) ?? fallbackMs;
  const flags: string[] = [];
  const speedStatus = stringOrNull(
    metric?.speed_status ?? metric?.speedStatus,
  );
  if (speedStatus === "slow" || speedStatus === "critical") flags.push("slow");
  if (speedStatus === "critical") flags.push("critical_speed");
  if (!valueCounts.displayed) flags.push("no_results");
  if (errors.length) flags.push("errors");
  if (warnings.length) flags.push("warnings");
  if (engine === "compare") flags.push("engine_comparison");

  return {
    index,
    query,
    ok: Boolean(result?.success ?? !errors.length) && errors.length === 0,
    normalized_search_type: stringOrNull(mode),
    primary_domain: stringOrNull(domain),
    restaurant_count: valueCounts.restaurantCount,
    activity_count: valueCounts.activityCount,
    pair_count: valueCounts.pairCount,
    fallback_pair_count: Number(
      result?.fallback_pair_count ?? debug?.fallbackPairCount ?? 0,
    ),
    fallbackPairsUsedAsPrimary: Boolean(
      result?.fallbackPairsUsedAsPrimary ?? debug?.fallbackPairsUsedAsPrimary,
    ),
    primaryResultType: stringOrNull(
      result?.primaryResultType ?? debug?.primaryResultType,
    ),
    timing_ms: timingMs,
    speed_status: speedStatus,
    intentParserSource: stringOrNull(
      result?.intentParserSource ?? debug?.intentParserSource,
    ),
    fastPathMatched: Boolean(debug?.fastPathMatched),
    fastPathReason: stringOrNull(debug?.fastPathReason),
    llm_ms: numberOrNull(metric?.llm_ms ?? metric?.llmMs),
    rpc_ms: numberOrNull(metric?.rpc_ms ?? metric?.rpcMs),
    intent_parse_ms: numberOrNull(
      metric?.intent_parse_ms ?? metric?.intentParseMs,
    ),
    ranking_ms: numberOrNull(metric?.ranking_ms ?? metric?.rankingMs),
    result_count: valueCounts.displayed,
    no_results_reason: stringOrNull(
      debug?.noResultsReason ?? result?.fallback?.reason,
    ),
    no_pairs_reason: stringOrNull(debug?.noPairsReason),
    warnings,
    errors,
    suspiciousFlags: flags,
    activityTerms: stringArray(
      debug?.activityTerms ?? intent?.activity?.categories ?? [],
    ),
    restaurantTerms: stringArray(
      debug?.restaurantTerms ?? [
        ...asArray(intent?.restaurant?.cuisines),
        ...asArray(intent?.restaurant?.foods),
        ...asArray(intent?.restaurant?.features),
      ],
    ),
    needsRestaurant: Boolean(
      intent?.needsRestaurant ?? intent?.restaurant?.required,
    ),
    needsActivity: Boolean(intent?.needsActivity ?? intent?.activity?.required),
    engine,
  };
}

function comparisonWarnings(legacy: any, v2: any) {
  const left = counts(legacy);
  const right = counts(v2);
  return [
    `Compare: Legacy results ${left.displayed}; V2 results ${right.displayed}.`,
    `Compare: restaurant delta ${right.restaurantCount - left.restaurantCount}, activity delta ${right.activityCount - left.activityCount}, pair delta ${right.pairCount - left.pairCount}.`,
  ];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const delayMs = clampInteger(body?.delayMs, DEFAULT_DELAY_MS, 0, MAX_DELAY_MS);
  const maxQueries = clampInteger(body?.maxQueries, MAX_QUERIES, 1, MAX_QUERIES);
  const includeFullDebug = body?.includeFullDebug !== false;
  const queries = stringArray(body?.queries).slice(0, maxQueries);
  const engine = selectedEngine(request, body);

  if (!queries.length) {
    return NextResponse.json(
      { ok: false, error: "At least one query is required." },
      { status: 400 },
    );
  }

  const startedAt = new Date();
  const summary: QaSummary[] = [];
  const results: any[] = [];

  const run = async (query: string, override: "legacy" | "v2", requestId: string) =>
    runOutingSearch({
      query,
      body: {
        query,
        requestId,
        debug: true,
        includeDebug: true,
        betaDebug: true,
      },
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

  for (const [index, query] of queries.entries()) {
    const queryStarted = Date.now();
    let result: any = null;
    let caughtError: unknown = null;

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
        result = {
          success: Boolean(legacy?.success || v2?.success),
          comparisonMode: true,
          searchCoreOverride: "compare",
          legacy,
          v2,
          comparison: {
            legacyCounts: counts(legacy),
            v2Counts: counts(v2),
          },
        };
        const itemSummary = buildSummary(
          index,
          query,
          engine,
          v2?.success ? v2 : legacy,
          Date.now() - queryStarted,
          comparisonWarnings(legacy, v2),
        );
        summary.push(itemSummary);
        results.push(
          includeFullDebug
            ? { index, query, summary: itemSummary, result }
            : { index, query, summary: itemSummary },
        );
      } else {
        result = await run(query, engine, crypto.randomUUID());
        const itemSummary = buildSummary(
          index,
          query,
          engine,
          result,
          Date.now() - queryStarted,
        );
        summary.push(itemSummary);
        results.push(
          includeFullDebug
            ? { index, query, summary: itemSummary, result }
            : { index, query, summary: itemSummary },
        );
      }
    } catch (error) {
      caughtError = error;
      result = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      const itemSummary = buildSummary(
        index,
        query,
        engine,
        result,
        Date.now() - queryStarted,
        [],
        caughtError,
      );
      summary.push(itemSummary);
      results.push(
        includeFullDebug
          ? { index, query, summary: itemSummary, result }
          : { index, query, summary: itemSummary },
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
