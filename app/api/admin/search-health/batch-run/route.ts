import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DELAY_MS = 200;
const MAX_QUERIES = 100;
const MAX_DELAY_MS = 5000;

const SPORTS_WATCH_BAD_TERMS = [
  "rooftop lounge",
  "club",
  "dance club",
  "dancing",
  "live dj",
  "speakeasy",
  "nightlife",
];

const RELAXED_QUERY_TERMS = [
  "relaxed",
  "chill",
  "casual",
  "no club",
  "not a club",
  "not too loud",
  "lowkey",
  "laid back",
];

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
};

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
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

function getDebug(fullJson: any) {
  return fullJson?.debug ?? fullJson?.diagnostics?.debug ?? {};
}

function getNormalizedIntent(debug: any, fullJson: any) {
  return (
    debug?.normalizedIntent ??
    fullJson?.normalizedIntent ??
    debug?.parsedIntent ??
    {}
  );
}

function getPerformance(debug: any, fullJson: any) {
  return debug?.performance ?? fullJson?.searchPerformance ?? {};
}

function getActivityTerms(debug: any, normalizedIntent: any, fullJson: any) {
  return Array.from(
    new Set(
      [
        ...stringArray(debug?.activityTerms),
        ...stringArray(normalizedIntent?.activityIntent?.activityTerms),
        ...String(fullJson?.diagnostics?.activity_search_input ?? "")
          .split(/[,\s]+/)
          .map((term) => term.trim())
          .filter(Boolean),
      ].map((term) => term.toLowerCase()),
    ),
  );
}

function getRestaurantTerms(debug: any, normalizedIntent: any, fullJson: any) {
  return Array.from(
    new Set(
      [
        ...stringArray(debug?.restaurantTerms),
        ...stringArray(normalizedIntent?.restaurantIntent?.mealTerms),
        ...stringArray(normalizedIntent?.restaurantIntent?.foodTerms),
        ...stringArray(normalizedIntent?.restaurantIntent?.cuisineTerms),
        ...String(fullJson?.diagnostics?.restaurant_search_input ?? "")
          .split(/[,\s]+/)
          .map((term) => term.trim())
          .filter(Boolean),
      ].map((term) => term.toLowerCase()),
    ),
  );
}

function containsTerm(values: string[], terms: string[]) {
  const text = values.join(" ").toLowerCase();
  return terms.some((term) => text.includes(term));
}

function isSportsWatch(query: string, normalizedIntent: any) {
  const text =
    `${query} ${normalizedIntent?.searchType ?? ""} ${normalizedIntent?.primaryDomain ?? ""}`.toLowerCase();
  return /\b(sports?|watch|game|knicks|giants|mets|nba|ufc|football|basketball|bar with tv|big screens?)\b/.test(
    text,
  );
}

function hasRelaxedNoClubQuery(query: string) {
  const text = query.toLowerCase();
  return RELAXED_QUERY_TERMS.some((term) => text.includes(term));
}

function walkingOverLimitPossible(fullJson: any, debug: any) {
  const max = numberOrNull(
    debug?.maxPairWalkingMinutes ??
      debug?.pairingPreference?.maxPairWalkingMinutes,
  );
  if (!max) return false;
  const minuteValues = [
    ...stringArray(debug?.displayedWalkingMinuteLabels).map(
      (label) => label.match(/\d+/)?.[0],
    ),
    ...asArray(fullJson?.pairs).map(
      (pair) =>
        pair?.walking_minutes ??
        pair?.safe_walking_minutes ??
        pair?.pair_walking_minutes,
    ),
  ]
    .map(numberOrNull)
    .filter((value): value is number => value !== null);
  return minuteValues.some((minutes) => minutes > max);
}

function getSuspiciousFlags(summary: QaSummary, fullJson: any) {
  const debug = getDebug(fullJson);
  const normalizedIntent = getNormalizedIntent(debug, fullJson);
  const flags = new Set<string>();
  const speed = String(summary.speed_status ?? "").toLowerCase();
  const parser = String(summary.intentParserSource ?? "").toLowerCase();

  if (["slow", "critical"].includes(speed)) flags.add("slow");
  if (speed === "critical") flags.add("critical_speed");
  if (parser.includes("llm")) flags.add("llm_used");
  if (parser === "deterministic_fallback") flags.add("deterministic_fallback");
  if (
    summary.restaurant_count === 0 &&
    summary.activity_count === 0 &&
    summary.pair_count === 0
  ) {
    flags.add("no_results");
  }
  if (
    summary.normalized_search_type === "mixed_outing" &&
    summary.pair_count === 0
  ) {
    flags.add("mixed_no_pairs");
  }
  if (summary.needsRestaurant && summary.restaurant_count === 0)
    flags.add("zero_restaurants");
  if (summary.needsActivity && summary.activity_count === 0)
    flags.add("zero_activities");
  if (
    isSportsWatch(summary.query, normalizedIntent) &&
    containsTerm(summary.activityTerms, SPORTS_WATCH_BAD_TERMS)
  ) {
    flags.add("sports_watch_bad_terms");
  }
  if (
    hasRelaxedNoClubQuery(summary.query) &&
    containsTerm(summary.activityTerms, SPORTS_WATCH_BAD_TERMS)
  ) {
    flags.add("relaxed_no_club_bad_terms");
    flags.add("broad_activity_terms");
  }
  if (walkingOverLimitPossible(fullJson, debug))
    flags.add("walking_over_limit_possible");
  if (summary.errors.length) flags.add("errors");
  if (summary.warnings.length) flags.add("warnings");

  return Array.from(flags);
}

function buildSummary(
  index: number,
  query: string,
  fullJson: any,
  fallbackMs: number,
  caughtError?: unknown,
): QaSummary {
  const debug = getDebug(fullJson);
  const normalizedIntent = getNormalizedIntent(debug, fullJson);
  const performance = getPerformance(debug, fullJson);
  const restaurants = asArray(fullJson?.restaurants);
  const activities = asArray(fullJson?.activities);
  const pairs = asArray(fullJson?.pairs);
  const matched = asArray(
    fullJson?.matched_locations ?? fullJson?.matchedLocations,
  );
  const warnings = [
    ...stringArray(fullJson?.warnings),
    ...stringArray(debug?.warnings),
    ...stringArray(debug?.qualityWarnings),
  ];
  const errors = [
    ...stringArray(fullJson?.errors),
    ...stringArray(debug?.errors),
    ...(fullJson?.error ? [String(fullJson.error)] : []),
    ...(caughtError instanceof Error
      ? [caughtError.message]
      : caughtError
        ? [String(caughtError)]
        : []),
  ];

  const summary: QaSummary = {
    index,
    query,
    ok: Boolean(fullJson?.success) && errors.length === 0,
    normalized_search_type: stringOrNull(
      normalizedIntent?.searchType ??
        normalizedIntent?.search_type ??
        fullJson?.render_mode ??
        fullJson?.renderMode,
    ),
    primary_domain: stringOrNull(
      normalizedIntent?.primaryDomain ?? normalizedIntent?.primary_domain,
    ),
    restaurant_count: restaurants.length,
    activity_count: activities.length,
    pair_count: pairs.length,
    fallback_pair_count: Number(
      fullJson?.fallbackPairs?.length ??
        fullJson?.recommendedFallbackPairs?.length ??
        debug?.fallback_pair_count ??
        debug?.fallbackPairCount ??
        0,
    ),
    fallbackPairsUsedAsPrimary: Boolean(
      fullJson?.fallbackPairsUsedAsPrimary ?? debug?.fallbackPairsUsedAsPrimary,
    ),
    primaryResultType: stringOrNull(
      fullJson?.primaryResultType ?? debug?.primaryResultType,
    ),
    timing_ms:
      numberOrNull(
        performance?.total_ms ?? performance?.totalMs ?? debug?.timingMs,
      ) ?? fallbackMs,
    speed_status: stringOrNull(
      performance?.speed_status ??
        performance?.speedStatus ??
        fullJson?.searchPerformance?.speedStatus,
    ),
    intentParserSource: stringOrNull(
      debug?.intentParserSource ?? performance?.intentParserSource,
    ),
    fastPathMatched: Boolean(
      debug?.fastPathMatched ?? performance?.fastPathMatched,
    ),
    fastPathReason: stringOrNull(
      debug?.fastPathReason ?? performance?.fastPathReason,
    ),
    llm_ms: numberOrNull(performance?.llm_ms ?? performance?.llmMs),
    rpc_ms: numberOrNull(performance?.rpc_ms ?? performance?.rpcMs),
    intent_parse_ms: numberOrNull(
      performance?.intent_parse_ms ?? performance?.intentParseMs,
    ),
    ranking_ms: numberOrNull(performance?.ranking_ms ?? performance?.rankingMs),
    result_count:
      numberOrNull(performance?.result_count ?? performance?.resultCount) ??
      matched.length,
    no_results_reason: stringOrNull(
      debug?.noResultsReason ??
        debug?.no_results_reason ??
        fullJson?.diagnostics?.no_results_reason,
    ),
    no_pairs_reason: stringOrNull(
      debug?.noPairsReason ?? debug?.no_pairs_reason,
    ),
    warnings,
    errors,
    suspiciousFlags: [],
    activityTerms: getActivityTerms(debug, normalizedIntent, fullJson),
    restaurantTerms: getRestaurantTerms(debug, normalizedIntent, fullJson),
    needsRestaurant: Boolean(normalizedIntent?.needsRestaurant),
    needsActivity: Boolean(normalizedIntent?.needsActivity),
  };

  summary.suspiciousFlags = getSuspiciousFlags(summary, fullJson);
  return summary;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function originFromRequest(request: NextRequest) {
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const delayMs = clampInteger(
    body?.delayMs,
    DEFAULT_DELAY_MS,
    0,
    MAX_DELAY_MS,
  );
  const requestedMaxQueries = clampInteger(
    body?.maxQueries,
    MAX_QUERIES,
    1,
    MAX_QUERIES,
  );
  const includeFullDebug = body?.includeFullDebug !== false;
  const queries = stringArray(body?.queries).slice(0, requestedMaxQueries);

  if (!queries.length) {
    return NextResponse.json(
      { ok: false, error: "At least one query is required." },
      { status: 400 },
    );
  }

  const startedAt = new Date();
  const results: any[] = [];
  const summary: QaSummary[] = [];
  const origin = originFromRequest(request);
  const cookie = request.headers.get("cookie") ?? "";
  const authorization = request.headers.get("authorization") ?? "";

  for (const [index, query] of queries.entries()) {
    const queryStarted = Date.now();
    let fullJson: any = null;
    let caughtError: unknown = null;

    try {
      const response = await fetch(`${origin}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { cookie } : {}),
          ...(authorization ? { authorization } : {}),
          "x-admin-search-health-batch": "true",
        },
        body: JSON.stringify({
          query,
          debug: true,
          includeDebug: true,
          betaDebug: true,
          source: "admin_search_health_batch_qa",
        }),
        cache: "no-store",
      });
      fullJson = await response.json().catch(() => ({
        success: false,
        error: `Search returned non-JSON response (${response.status})`,
      }));
      if (!response.ok) {
        fullJson = {
          ...fullJson,
          success: false,
          error:
            fullJson?.error ?? `Search failed with status ${response.status}`,
        };
      }
    } catch (error) {
      caughtError = error;
      fullJson = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        restaurants: [],
        activities: [],
        pairs: [],
      };
    }

    const itemSummary = buildSummary(
      index,
      query,
      fullJson,
      Date.now() - queryStarted,
      caughtError,
    );
    summary.push(itemSummary);
    results.push(
      includeFullDebug
        ? { index, query, summary: itemSummary, result: fullJson }
        : { index, query, summary: itemSummary },
    );

    if (index < queries.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const finishedAt = new Date();
  return NextResponse.json({
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    count: summary.length,
    summary,
    results,
  });
}
