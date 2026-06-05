import { supabaseAdmin } from "../../supabase-admin";

export type SearchHealthSource =
  | "admin_search_lab"
  | "public_create_search"
  | "beta_tester_search"
  | "search_api"
  | string;

type LoggerArgs = {
  source?: SearchHealthSource | null;
  environment?: string | null;
  rawQuery?: string | null;
  result?: any;
  debug?: any;
  errors?: unknown[] | unknown;
  warnings?: unknown[] | unknown;
  createdByUserId?: string | null;
  betaTesterId?: string | null;
  betaAssignmentId?: string | null;
  debugMode?: boolean;
  noResultsReason?: string | null;
  noPairsReason?: string | null;
  timingMs?: number | null;
  speedStatus?: string | null;
};

function asArray(value: unknown): unknown[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter((item) => item != null) : [value];
}

function toInteger(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function safeSlice<T = unknown>(value: unknown, limit: number): T[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function countFrom(result: any, debug: any, key: string, fallbackKeys: string[] = []) {
  const keys = [key, ...fallbackKeys];
  for (const candidate of keys) {
    const value = debug?.[candidate] ?? result?.[candidate];
    const n = toInteger(value);
    if (n != null) return n;
  }
  return null;
}

function arrayCount(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function inferRestaurantCount(result: any, debug: any): number {
  return (
    countFrom(result, debug, "restaurant_count", ["restaurantCount"]) ??
    arrayCount(result?.restaurants) ??
    toInteger(result?.card_counts?.restaurants) ??
    toInteger(result?.cardCounts?.restaurants) ??
    0
  );
}

function inferActivityCount(result: any, debug: any): number {
  return (
    countFrom(result, debug, "activity_count", ["activityCount"]) ??
    arrayCount(result?.activities) ??
    toInteger(result?.card_counts?.activities) ??
    toInteger(result?.cardCounts?.activities) ??
    0
  );
}

function inferPairCount(result: any, debug: any): number {
  return (
    countFrom(result, debug, "pair_count", ["pairCount"]) ??
    arrayCount(result?.pairs) ??
    toInteger(result?.card_counts?.pairs) ??
    toInteger(result?.cardCounts?.pairs) ??
    0
  );
}

function inferNoResultsReason(args: LoggerArgs, restaurantCount: number, activityCount: number) {
  const result = args.result ?? {};
  const debug = args.debug ?? result.debug ?? {};
  const intent = debug?.normalizedIntent ?? result?.normalizedIntent ?? {};
  if (args.noResultsReason) return args.noResultsReason;
  if (debug?.noResultsReason) return String(debug.noResultsReason);
  if (result?.diagnostics?.no_results_reason) return String(result.diagnostics.no_results_reason);
  if (restaurantCount === 0 && activityCount === 0) return "no_restaurant_or_activity_results";
  if (restaurantCount === 0) return "no_restaurant_results";
  if (intent?.needsActivity === true && activityCount === 0) return "no_activity_results";
  return null;
}

function normalizeJsonValue(value: unknown): unknown {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => {
      if (typeof item === "string" && item.length > 2000) return `${item.slice(0, 2000)}…`;
      return item;
    }));
  } catch {
    return String(value);
  }
}

export function buildSearchHealthDebug(result: any, debug: any) {
  const normalizedIntent = debug?.normalizedIntent ?? result?.normalizedIntent ?? null;
  const performance = debug?.performance ?? result?.searchPerformance ?? null;

  return normalizeJsonValue({
    normalizedIntent,
    originalGeo: debug?.originalGeo ?? null,
    effectiveGeo: debug?.effectiveGeo ?? debug?.geo ?? null,
    pairingPreference: debug?.pairingPreference ?? normalizedIntent?.pairingPreference ?? null,
    counts: {
      restaurants: inferRestaurantCount(result, debug),
      activities: inferActivityCount(result, debug),
      pairs: inferPairCount(result, debug),
      pairCandidatesEvaluated: toInteger(debug?.pairCandidatesEvaluated),
      validPairCountBeforeRender: toInteger(debug?.validPairCountBeforeRender),
      extremeWalkingRoutesRejected: toInteger(debug?.extremeWalkingRoutesRejected) ?? 0,
      invalidWalkingRoutesHiddenFromDisplay: toInteger(debug?.invalidWalkingRoutesHiddenFromDisplay) ?? 0,
      suppressedLowQualityPairCount: toInteger(debug?.suppressedLowQualityPairCount) ?? 0,
    },
    rejectedPairs: safeSlice(debug?.rejectedPairs, 25),
    restaurantQualityScorePreview: safeSlice(debug?.restaurantQualityScorePreview, 12),
    activityQualityScorePreview: safeSlice(debug?.activityQualityScorePreview, 12),
    pairQualityScorePreview: safeSlice(debug?.pairQualityScorePreview, 12),
    performance,
  });
}

export function buildSearchHealthEventPayload(args: LoggerArgs) {
  const result = args.result ?? {};
  const debug = args.debug ?? result.debug ?? {};
  const normalizedIntent = debug?.normalizedIntent ?? result?.normalizedIntent ?? null;
  const performance = debug?.performance ?? {};
  const restaurantCount = inferRestaurantCount(result, debug);
  const activityCount = inferActivityCount(result, debug);
  const pairCount = inferPairCount(result, debug);
  const timingMs = toInteger(args.timingMs ?? debug?.timingMs ?? performance?.total_ms ?? result?.searchPerformance?.totalMs);
  const speedStatus = args.speedStatus ?? performance?.speed_status ?? result?.searchPerformance?.speedStatus ?? null;
  const errors = asArray(args.errors ?? debug?.errors ?? debug?.error ?? debug?.edge_error ?? debug?.llmError);
  const warnings = asArray(args.warnings ?? debug?.warnings ?? debug?.warning);
  const noResultsReason = inferNoResultsReason(args, restaurantCount, activityCount);
  const noPairsReason = args.noPairsReason ?? debug?.noPairsReason ?? null;

  return {
    source: args.source ?? debug?.source ?? "search",
    environment: args.environment ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production",
    raw_query: args.rawQuery ?? debug?.rawQuery ?? normalizedIntent?.rawQuery ?? null,
    normalized_search_type: normalizedIntent?.searchType ?? result?.render_mode ?? result?.renderMode ?? null,
    primary_domain: normalizedIntent?.primaryDomain ?? normalizedIntent?.primary_domain ?? null,
    default_market_applied: toBoolean(debug?.defaultMarketApplied),
    default_market_id: debug?.defaultMarketId ?? null,
    distance_mode: debug?.distanceMode ?? normalizedIntent?.pairingPreference?.distanceMode ?? null,
    max_pair_distance_miles: toNumber(debug?.maxPairDistanceMiles ?? normalizedIntent?.pairingPreference?.maxPairDistanceMiles),
    max_pair_walking_minutes: toNumber(debug?.maxPairWalkingMinutes ?? normalizedIntent?.pairingPreference?.maxPairWalkingMinutes),
    restaurant_count: restaurantCount,
    activity_count: activityCount,
    pair_count: pairCount,
    pair_candidates_evaluated: toInteger(debug?.pairCandidatesEvaluated),
    valid_pair_count_before_render: toInteger(debug?.validPairCountBeforeRender),
    no_results_reason: noResultsReason,
    no_pairs_reason: noPairsReason ? String(noPairsReason) : null,
    errors: normalizeJsonValue(errors),
    warnings: normalizeJsonValue(warnings),
    debug: buildSearchHealthDebug(result, debug),
    timing_ms: timingMs,
    speed_status: speedStatus ? String(speedStatus) : null,
    created_by_user_id: args.createdByUserId ?? null,
    beta_tester_id: args.betaTesterId ?? debug?.performance?.beta_tester_id ?? null,
    beta_assignment_id: args.betaAssignmentId ?? debug?.performance?.beta_assignment_id ?? null,
  };
}

export function shouldLogSearchHealthEvent(input: LoggerArgs | any): boolean {
  const args: LoggerArgs = input?.result || input?.debug || input?.source ? input : { result: input };
  const payload = buildSearchHealthEventPayload(args);
  const debug = args.debug ?? args.result?.debug ?? {};
  const normalizedIntent = debug?.normalizedIntent ?? args.result?.normalizedIntent ?? {};
  const needsActivity = normalizedIntent?.needsActivity === true;
  const wantsPairing = normalizedIntent?.wantsPairing === true || args.result?.render_mode === "mixed_pairs" || args.result?.renderMode === "mixed_pairs" || args.result?.render_mode === "partial_mixed" || args.result?.renderMode === "partial_mixed";
  const timingMs = Number(payload.timing_ms ?? 0);
  const speedStatus = String(payload.speed_status ?? "").toLowerCase();

  return (
    (Array.isArray(payload.errors) && payload.errors.length > 0) ||
    (wantsPairing && payload.pair_count === 0) ||
    payload.restaurant_count === 0 ||
    (needsActivity && payload.activity_count === 0) ||
    Boolean(payload.no_pairs_reason) ||
    Boolean(payload.no_results_reason) ||
    timingMs > 3000 ||
    ["slow", "degraded", "critical", "failed", "timeout"].includes(speedStatus) ||
    Number(debug?.extremeWalkingRoutesRejected ?? 0) > 0 ||
    Number(debug?.invalidWalkingRoutesHiddenFromDisplay ?? 0) > 0 ||
    Number(debug?.suppressedLowQualityPairCount ?? 0) > 0 ||
    ((payload.source === "admin_search_lab" || payload.source === "beta_tester_search" || Boolean(payload.beta_tester_id)) && args.debugMode === true)
  );
}

export async function logSearchHealthEvent(args: LoggerArgs): Promise<void> {
  try {
    if (!shouldLogSearchHealthEvent(args)) return;
    const payload = buildSearchHealthEventPayload(args);
    const { error } = await supabaseAdmin.from("search_health_events").insert(payload);
    if (error) console.warn("Search health logging failed", error.message);
  } catch (error) {
    console.warn("Search health logging failed", error);
  }
}
