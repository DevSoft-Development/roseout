import { supabaseAdmin } from "../../supabase-admin";

export type SearchHealthSource =
  | "admin_search_lab"
  | "public_create_search"
  | "public_explore_search"
  | "public_plan_search"
  | "beta_tester_search"
  | "search_api"
  | "admin_test_event"
  | string;

export type SearchHealthSeverity = "info" | "warning" | "error" | "critical";

const SEARCH_HEALTH_SLOW_WARNING_MS = 5000;
const SEARCH_HEALTH_SLOW_STATUSES = new Set([
  "degraded",
  "critical",
  "failed",
  "timeout",
]);

export type LoggerArgs = {
  source?: SearchHealthSource | null;
  environment?: string | null;
  rawQuery?: string | null;
  raw_query?: string | null;
  result?: any;
  debug?: any;
  errors?: unknown[] | unknown;
  warnings?: unknown[] | unknown;
  createdByUserId?: string | null;
  created_by_user_id?: string | null;
  betaTesterId?: string | null;
  beta_tester_id?: string | null;
  betaAssignmentId?: string | null;
  beta_assignment_id?: string | null;
  debugMode?: boolean;
  debugEnabled?: boolean;
  logSearchHealth?: boolean;
  forceLog?: boolean;
  forceLogSearchHealth?: boolean;
  betaFeedbackSubmitted?: boolean;
  noResultsReason?: string | null;
  no_results_reason?: string | null;
  noPairsReason?: string | null;
  no_pairs_reason?: string | null;
  timingMs?: number | null;
  timing_ms?: number | null;
  speedStatus?: string | null;
  speed_status?: string | null;
  needsActivity?: boolean | null;
  needsRestaurant?: boolean | null;
  wantsPairing?: boolean | null;
  distanceMode?: string | null;
  requireWalkablePair?: boolean | null;
  maxPairWalkingMinutes?: number | null;
  restaurant_count?: number | null;
  activity_count?: number | null;
  pair_count?: number | null;
  pairCandidatesEvaluated?: number | null;
  validPairCountBeforeRender?: number | null;
  extremeWalkingRoutesRejected?: number | null;
  invalidWalkingRoutesHiddenFromDisplay?: number | null;
  suppressedLowQualityPairCount?: number | null;
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
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function safeSlice<T = unknown>(value: unknown, limit: number): T[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function safeStringArray(value: unknown, limit = 24): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "string" ? item.trim() : String(item ?? "").trim(),
    )
    .filter(Boolean)
    .slice(0, limit);
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function compactRecord<T extends Record<string, unknown>>(
  record: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

const SEARCH_HEALTH_REJECTION_REASONS = [
  "walking_route_exceeds_requested_minutes",
  "pair_distance_exceeds_requested_max",
  "missing_coordinates",
  "extreme_walking_route_duration",
  "wrong_domain",
  "no_activity_match",
  "no_restaurant_match",
  "cross_state_low_priority",
] as const;

function canonicalRejectionReason(reason: unknown): string | null {
  const normalized = String(reason ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (
    normalized === "distance" ||
    normalized === "walking_limit_exceeded" ||
    normalized === "pair_distance_exceeds_limit"
  )
    return "pair_distance_exceeds_requested_max";
  if (
    normalized === "walking_minutes_exceeds_limit" ||
    normalized === "walking_minutes_exceeds_requested_max"
  )
    return "walking_route_exceeds_requested_minutes";
  if (
    normalized === "extreme_walking_route" ||
    normalized === "extreme_walking_route_duration"
  )
    return "extreme_walking_route_duration";
  if (
    normalized === "missing_coordinates" ||
    normalized === "distance_unavailable"
  )
    return "missing_coordinates";
  if (normalized === "wrong_domain" || normalized === "domain_mismatch")
    return "wrong_domain";
  if (normalized === "no_activity_match") return "no_activity_match";
  if (normalized === "no_restaurant_match") return "no_restaurant_match";
  if (normalized === "cross_state_low_priority" || normalized === "cross_state")
    return "cross_state_low_priority";
  return SEARCH_HEALTH_REJECTION_REASONS.includes(normalized as any)
    ? normalized
    : null;
}

function incrementReason(
  summary: Record<string, number>,
  reason: string | null,
  count = 1,
) {
  if (!reason || count <= 0) return;
  summary[reason] = (summary[reason] ?? 0) + count;
}

function buildRejectionReasonSummary(debug: any) {
  const summary: Record<string, number> = {};

  for (const rejected of safeSlice<any>(debug?.rejectedPairs, 500)) {
    incrementReason(summary, canonicalRejectionReason(rejected?.reason));
  }

  for (const [reason, count] of Object.entries(
    debug?.walkingPairRejectReasons ?? {},
  )) {
    incrementReason(
      summary,
      canonicalRejectionReason(reason),
      toInteger(count) ?? 0,
    );
  }

  incrementReason(
    summary,
    "pair_distance_exceeds_requested_max",
    toInteger(debug?.pairsRejectedForDistance) ?? 0,
  );
  incrementReason(
    summary,
    "missing_coordinates",
    toInteger(debug?.pairsRejectedForMissingCoordinates) ?? 0,
  );
  incrementReason(
    summary,
    "extreme_walking_route_duration",
    toInteger(debug?.extremeWalkingRoutesRejected) ?? 0,
  );

  const restaurantNoMatch =
    toInteger(debug?.restaurantRejectedSummary?.no_restaurant_match) ?? 0;
  const activityNoMatch =
    toInteger(debug?.activityRejectedSummary?.no_activity_match) ?? 0;
  incrementReason(summary, "no_restaurant_match", restaurantNoMatch);
  incrementReason(summary, "no_activity_match", activityNoMatch);

  return SEARCH_HEALTH_REJECTION_REASONS.reduce<Record<string, number>>(
    (acc, reason) => {
      acc[reason] = summary[reason] ?? 0;
      return acc;
    },
    {},
  );
}

function countFrom(
  result: any,
  debug: any,
  key: string,
  fallbackKeys: string[] = [],
) {
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

function inferRestaurantCount(
  args: LoggerArgs,
  result: any,
  debug: any,
): number {
  return (
    toInteger(args.restaurant_count) ??
    countFrom(result, debug, "restaurant_count", ["restaurantCount"]) ??
    arrayCount(result?.restaurants) ??
    toInteger(result?.card_counts?.restaurants) ??
    toInteger(result?.cardCounts?.restaurants) ??
    0
  );
}

function inferActivityCount(args: LoggerArgs, result: any, debug: any): number {
  return (
    toInteger(args.activity_count) ??
    countFrom(result, debug, "activity_count", ["activityCount"]) ??
    arrayCount(result?.activities) ??
    toInteger(result?.card_counts?.activities) ??
    toInteger(result?.cardCounts?.activities) ??
    0
  );
}

function inferPairCount(args: LoggerArgs, result: any, debug: any): number {
  return (
    toInteger(args.pair_count) ??
    countFrom(result, debug, "pair_count", ["pairCount"]) ??
    arrayCount(result?.pairs) ??
    toInteger(result?.card_counts?.pairs) ??
    toInteger(result?.cardCounts?.pairs) ??
    0
  );
}

const TERM_POLLUTION_TOKENS = new Set([
  "and",
  "with",
  "to",
  "do",
  "mini",
  "paint",
  "sip",
  "live",
  "big",
  "screen",
  "watch",
  "party",
  "game",
  "day",
  "night",
  "date",
  "raw",
  "tex",
  "mex",
  "house",
  "mignon",
  "prime",
  "rib",
  "outdoor",
  "dance",
  "dj",
  "open",
  "mic",
  "alley",
  "lanes",
  "driving",
  "range",
]);
const RELAXED_OVEREXPANDED_TERMS = new Set([
  "board games",
  "arcade",
  "mini golf",
  "bowling",
  "museum",
  "paint and sip",
]);
const SPORTS_WATCH_POLLUTION_TOKENS = new Set([
  "with",
  "big",
  "screen",
  "watch",
  "party",
  "game",
  "day",
  "live",
  "viewing",
  "and",
  "grill",
  "lakers",
  "warriors",
  "celtics",
  "cowboys",
  "eagles",
  "dodgers",
  "duke",
]);

function normalizeHealthTerm(term: unknown) {
  return String(term ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\s+/g, " ");
}

function allSearchHealthTerms(debug: any, normalizedIntent: any) {
  const restaurantIntent =
    normalizedIntent?.restaurantIntent ??
    normalizedIntent?.restaurant_intent ??
    {};
  const activityIntent =
    normalizedIntent?.activityIntent ?? normalizedIntent?.activity_intent ?? {};
  return {
    restaurantTerms: [
      ...safeStringArray(debug?.restaurantTerms, 100),
      ...safeStringArray(restaurantIntent?.mealTerms, 100),
      ...safeStringArray(restaurantIntent?.foodTerms, 100),
      ...safeStringArray(restaurantIntent?.cuisineTerms, 100),
      ...safeStringArray(restaurantIntent?.categoryTerms, 100),
      ...safeStringArray(restaurantIntent?.featureTerms, 100),
    ].map(normalizeHealthTerm),
    activityTerms: [
      ...safeStringArray(debug?.activityTerms, 100),
      ...safeStringArray(activityIntent?.activityTerms, 100),
      ...safeStringArray(activityIntent?.categoryTerms, 100),
      ...safeStringArray(activityIntent?.featureTerms, 100),
    ].map(normalizeHealthTerm),
  };
}

function buildSuspiciousFlags(
  args: LoggerArgs,
  result: any,
  debug: any,
  normalizedIntent: any,
) {
  const flags: string[] = [];
  const q = String(
    args.rawQuery ??
      args.raw_query ??
      debug?.rawQuery ??
      normalizedIntent?.rawQuery ??
      "",
  ).toLowerCase();
  const { restaurantTerms, activityTerms } = allSearchHealthTerms(
    debug,
    normalizedIntent,
  );
  const terms = [...restaurantTerms, ...activityTerms];
  if (terms.some((term) => TERM_POLLUTION_TOKENS.has(term)))
    flags.push("term_pollution");
  const llmMs = toInteger(
    debug?.performance?.llm_ms ??
      debug?.llm_ms ??
      result?.debug?.performance?.llm_ms,
  );
  const fastPathMatched =
    debug?.fastPathMatched === true ||
    debug?.fastPathReason ||
    debug?.performance?.fastPathMatched === true;
  if (fastPathMatched && Number(llmMs ?? 0) > 0)
    flags.push("llm_wait_on_fast_path");
  const quietVenue =
    /\b(no club|not a club|not a nightclub|no nightclub|no dancing|no dj|no live dj|not too loud|not loud|no loud music|quiet|quiet girls night|quiet bar|chill drinks|upscale lounge)\b/.test(
      q,
    );
  if (
    quietVenue &&
    activityTerms.some((term) => RELAXED_OVEREXPANDED_TERMS.has(term))
  )
    flags.push("relaxed_overexpanded");
  const sportsWatch =
    /\b(watch|showing|viewing|game|match|fight|nba|nfl|mlb|nhl|wnba|sports bar|watch party|game day|lakers|warriors|celtics|cowboys|eagles|dodgers|march madness|duke)\b/.test(
      q,
    );
  if (
    sportsWatch &&
    activityTerms.some(
      (term) =>
        SPORTS_WATCH_POLLUTION_TOKENS.has(term) ||
        term === "march" ||
        term === "madness",
    )
  )
    flags.push("sports_watch_term_pollution");
  const ok = result?.ok ?? result?.success;
  const activityOnlyVenue =
    /\b(cocktail bar|wine bar|rooftop bar|hookah bar|karaoke bar|comedy club|jazz club|speakeasy|lounge)\b/.test(
      q,
    ) && !/\b(dinner|brunch|lunch|breakfast|restaurant)\b/.test(q);
  if (ok === false && activityOnlyVenue) flags.push("activity_only_error");
  if (debug?.duplicateLocationShown === true || result?.duplicateLocationShown === true) flags.push("duplicate_location_shown");
  return Array.from(new Set(flags));
}
function normalizeJsonValue(value: unknown): unknown {
  if (value == null) return value;
  try {
    return JSON.parse(
      JSON.stringify(value, (key, item) => {
        const lowerKey = String(key).toLowerCase();
        if (
          lowerKey.includes("token") ||
          lowerKey.includes("secret") ||
          lowerKey.includes("apikey") ||
          lowerKey.includes("api_key") ||
          lowerKey === "authorization"
        ) {
          return "[redacted]";
        }
        if (typeof item === "string" && item.length > 2000)
          return `${item.slice(0, 2000)}…`;
        return item;
      }),
    );
  } catch {
    return String(value);
  }
}

function getIntent(args: LoggerArgs, result: any, debug: any) {
  return debug?.normalizedIntent ?? result?.normalizedIntent ?? {};
}

function needsRestaurantForSearch(args: LoggerArgs, result: any, debug: any) {
  const intent = getIntent(args, result, debug);
  if (typeof args.needsRestaurant === "boolean") return args.needsRestaurant;
  if (typeof intent?.needsRestaurant === "boolean")
    return intent.needsRestaurant;
  if (typeof intent?.needs_restaurant === "boolean")
    return intent.needs_restaurant;
  return true;
}

function needsActivityForSearch(args: LoggerArgs, result: any, debug: any) {
  const intent = getIntent(args, result, debug);
  if (typeof args.needsActivity === "boolean") return args.needsActivity;
  if (typeof intent?.needsActivity === "boolean") return intent.needsActivity;
  if (typeof intent?.needs_activity === "boolean") return intent.needs_activity;
  return false;
}

function wantsPairingForSearch(args: LoggerArgs, result: any, debug: any) {
  const intent = getIntent(args, result, debug);
  if (typeof args.wantsPairing === "boolean") return args.wantsPairing;
  return (
    intent?.wantsPairing === true ||
    intent?.wants_pairing === true ||
    ["mixed_pairs", "partial_mixed"].includes(
      String(
        result?.render_mode ?? result?.renderMode ?? debug?.renderMode ?? "",
      ),
    )
  );
}

function inferNoResultsReason(
  args: LoggerArgs,
  restaurantCount: number,
  activityCount: number,
) {
  const result = args.result ?? {};
  const debug = args.debug ?? result.debug ?? {};
  if (args.noResultsReason || args.no_results_reason)
    return args.noResultsReason ?? args.no_results_reason ?? null;
  if (debug?.noResultsReason) return String(debug.noResultsReason);
  if (debug?.no_results_reason) return String(debug.no_results_reason);
  if (result?.diagnostics?.no_results_reason)
    return String(result.diagnostics.no_results_reason);
  if (
    restaurantCount === 0 &&
    activityCount === 0 &&
    needsRestaurantForSearch(args, result, debug) &&
    needsActivityForSearch(args, result, debug)
  )
    return "no_restaurant_or_activity_results";
  if (restaurantCount === 0 && needsRestaurantForSearch(args, result, debug))
    return "no_restaurant_results";
  if (activityCount === 0 && needsActivityForSearch(args, result, debug))
    return "no_activity_results";
  return null;
}

function walkingMode(value: unknown) {
  return ["walking", "short_walk", "walk"].includes(
    String(value ?? "").toLowerCase(),
  );
}

function getIssueCounters(args: LoggerArgs, debug: any) {
  return {
    extremeWalkingRoutesRejected:
      toInteger(
        args.extremeWalkingRoutesRejected ??
          debug?.extremeWalkingRoutesRejected,
      ) ?? 0,
    invalidWalkingRoutesHiddenFromDisplay:
      toInteger(
        args.invalidWalkingRoutesHiddenFromDisplay ??
          debug?.invalidWalkingRoutesHiddenFromDisplay,
      ) ?? 0,
    suppressedLowQualityPairCount:
      toInteger(
        args.suppressedLowQualityPairCount ??
          debug?.suppressedLowQualityPairCount,
      ) ?? 0,
  };
}

function getRouteDebug(debug: any) {
  return debug?.performance?.route ?? debug?.route ?? null;
}

export function buildSearchHealthDebug(result: any, debug: any) {
  const normalizedIntent =
    debug?.normalizedIntent ?? result?.normalizedIntent ?? null;
  const performance = debug?.performance ?? result?.searchPerformance ?? null;
  const restaurantIntent =
    normalizedIntent?.restaurantIntent ??
    normalizedIntent?.restaurant_intent ??
    {};
  const activityIntent =
    normalizedIntent?.activityIntent ?? normalizedIntent?.activity_intent ?? {};
  const geo =
    debug?.effectiveGeo ?? debug?.geo ?? normalizedIntent?.geo ?? null;
  const pairingPreference =
    debug?.pairingPreference ??
    normalizedIntent?.pairingPreference ??
    normalizedIntent?.pairing_preference ??
    null;
  const rejectionReasons = buildRejectionReasonSummary(debug);
  const counts = {
    restaurants: inferRestaurantCount({}, result, debug),
    activities: inferActivityCount({}, result, debug),
    pairs: inferPairCount({}, result, debug),
    fallback_pair_count:
      toInteger(debug?.fallback_pair_count ?? debug?.fallbackPairCount) ??
      arrayCount(result?.fallbackPairs) ??
      arrayCount(result?.recommendedFallbackPairs) ??
      toInteger(result?.card_counts?.fallback_pair_count) ??
      toInteger(result?.card_counts?.fallbackPairs) ??
      0,
    fallbackPairsUsedAsPrimary: toBoolean(
      result?.fallbackPairsUsedAsPrimary ?? debug?.fallbackPairsUsedAsPrimary,
    ),
    primaryResultType:
      result?.primaryResultType ?? debug?.primaryResultType ?? null,
    pairCandidatesEvaluated: toInteger(debug?.pairCandidatesEvaluated),
    validPairCountBeforeRender: toInteger(debug?.validPairCountBeforeRender),
    finalDisplayedResultCount:
      toInteger(
        debug?.finalDisplayedResultCount ??
          performance?.result_count ??
          result?.card_counts?.matched_locations ??
          result?.cardCounts?.matched_locations,
      ) ??
      arrayCount(result?.cards) ??
      arrayCount(result?.matched_locations) ??
      arrayCount(result?.matchedLocations),
    pairsRejectedForDistance: toInteger(debug?.pairsRejectedForDistance) ?? 0,
    pairsRejectedForMissingCoordinates:
      toInteger(debug?.pairsRejectedForMissingCoordinates) ?? 0,
    extremeWalkingRoutesRejected:
      toInteger(debug?.extremeWalkingRoutesRejected) ?? 0,
    invalidWalkingRoutesHiddenFromDisplay:
      toInteger(debug?.invalidWalkingRoutesHiddenFromDisplay) ?? 0,
    suppressedLowQualityPairCount:
      toInteger(debug?.suppressedLowQualityPairCount) ?? 0,
  };

  return normalizeJsonValue({
    rawQuery:
      debug?.rawQuery ?? normalizedIntent?.rawQuery ?? result?.rawQuery ?? null,
    cleanedQuery: debug?.cleanedQuery ?? debug?.cleaned_query ?? null,
    searchMode: result?.searchMode ?? debug?.searchMode ?? normalizedIntent?.normalizedIntent ?? normalizedIntent?.searchType ?? null,
    sameLocationRequired: toBoolean(result?.sameLocationRequired ?? debug?.sameLocationRequired ?? normalizedIntent?.sameLocationRequired),
    wantsPairing: toBoolean(normalizedIntent?.wantsPairing ?? result?.wantsPairing ?? debug?.wantsPairing),
    needsRestaurant: toBoolean(normalizedIntent?.needsRestaurant ?? result?.needsRestaurant ?? debug?.needsRestaurant),
    needsActivity: toBoolean(normalizedIntent?.needsActivity ?? result?.needsActivity ?? debug?.needsActivity),
    pairCount: counts.pairs,
    duplicateLocationShown: toBoolean(result?.duplicateLocationShown ?? debug?.duplicateLocationShown) ?? false,
    duplicateLocationCount: toInteger(result?.duplicateLocationCount ?? debug?.duplicateLocationCount) ?? 0,
    duplicateLocationErrors: safeStringArray(result?.duplicateLocationErrors ?? debug?.duplicateLocationErrors, 50),
    duplicateLocationWarnings: safeStringArray(result?.duplicateLocationWarnings ?? debug?.duplicateLocationWarnings, 50),
    duplicateLocationKeys: safeStringArray(result?.duplicateLocationKeys ?? debug?.duplicateLocationKeys, 50),
    comboCandidateCount: toInteger(result?.comboCandidateCount ?? debug?.comboCandidateCount ?? debug?.sameVenueStrongMatchCount ?? debug?.singleVenueWithStrongDualMatchCount),
    dedupedResultCount: toInteger(result?.dedupedResultCount ?? debug?.dedupedResultCount ?? result?.matched_locations?.length ?? result?.matchedLocations?.length),
    fallbackMode: result?.fallbackMode ?? debug?.fallbackMode ?? null,
    renderMode: result?.renderMode ?? result?.render_mode ?? debug?.renderMode ?? null,
    selectedSearchLane: debug?.selectedSearchLane ?? debug?.selected_search_lane ?? null,
    primaryIntent: debug?.primaryIntent ?? debug?.primary_intent ?? null,
    secondaryIntents: safeStringArray(debug?.secondaryIntents ?? debug?.secondary_intents),
    requestedMarket: normalizedIntent?.geo?.requestedMarket ?? debug?.requestedMarket ?? null,
    parsedBorough: normalizedIntent?.geo?.borough ?? debug?.parsedBorough ?? null,
    mlAppliedInPublicPath: toBoolean(debug?.mlAppliedInPublicPath),
    publicSearchUsesMl: toBoolean(debug?.publicSearchUsesMl),
    route: getRouteDebug(debug),
    searchType:
      normalizedIntent?.searchType ??
      normalizedIntent?.search_type ??
      result?.render_mode ??
      result?.renderMode ??
      null,
    primaryDomain:
      normalizedIntent?.primaryDomain ??
      normalizedIntent?.primary_domain ??
      null,
    intentParserSource:
      debug?.intentParserSource ?? performance?.intentParserSource ?? null,
    fastPathMatched: toBoolean(
      debug?.fastPathMatched ?? performance?.fastPathMatched,
    ),
    fastPathReason:
      debug?.fastPathReason ?? performance?.fastPathReason ?? null,
    fallback_pair_count: counts.fallback_pair_count,
    fallbackPairsUsedAsPrimary: counts.fallbackPairsUsedAsPrimary,
    primaryResultType: counts.primaryResultType,
    normalizedIntent,
    parsedIntent: normalizedIntent,
    searchTerms: {
      restaurant: {
        mealTerms: safeStringArray(
          restaurantIntent?.mealTerms ?? debug?.restaurantMealTerms,
        ),
        foodTerms: safeStringArray(
          restaurantIntent?.foodTerms ?? debug?.restaurantFoodTerms,
        ),
        cuisineTerms: safeStringArray(
          restaurantIntent?.cuisineTerms ?? debug?.restaurantCuisineTerms,
        ),
        categoryTerms: safeStringArray(
          restaurantIntent?.categoryTerms ?? debug?.restaurantCategoryTerms,
        ),
        vibeTerms: safeStringArray(
          restaurantIntent?.vibeTerms ?? debug?.restaurantVibeTerms,
        ),
        featureTerms: safeStringArray(
          restaurantIntent?.featureTerms ?? debug?.restaurantFeatureTerms,
        ),
      },
      activity: {
        activityTerms: safeStringArray(
          activityIntent?.activityTerms ?? debug?.activityTerms,
        ),
        categoryTerms: safeStringArray(
          activityIntent?.categoryTerms ?? debug?.activityCategoryTerms,
        ),
        vibeTerms: safeStringArray(
          activityIntent?.vibeTerms ?? debug?.activityVibeTerms,
        ),
        featureTerms: safeStringArray(
          activityIntent?.featureTerms ?? debug?.activityFeatureTerms,
        ),
      },
    },
    restaurantTerms: safeStringArray(debug?.restaurantTerms),
    activityTerms: safeStringArray(debug?.activityTerms),
    geo: compactRecord({
      raw: geo?.raw ?? null,
      neighborhood: geo?.neighborhood ?? null,
      borough: geo?.borough ?? null,
      city: geo?.city ?? null,
      state: geo?.state ?? null,
      latitude: numberOrNull(geo?.latitude),
      longitude: numberOrNull(geo?.longitude),
      radiusMiles: numberOrNull(geo?.radiusMiles),
      geoStrictness: geo?.geoStrictness ?? null,
    }),
    originalGeo: debug?.originalGeo ?? null,
    effectiveGeo: geo,
    pairingPreference: compactRecord({
      requiresPairing: toBoolean(
        pairingPreference?.requiresPairing ?? normalizedIntent?.wantsPairing,
      ),
      distanceMode:
        pairingPreference?.distanceMode ?? debug?.distanceMode ?? null,
      maxPairDistanceMiles: numberOrNull(
        pairingPreference?.maxPairDistanceMiles ?? debug?.maxPairDistanceMiles,
      ),
      maxPairWalkingMinutes: numberOrNull(
        pairingPreference?.maxPairWalkingMinutes ??
          debug?.maxPairWalkingMinutes,
      ),
      requireWalkablePair: toBoolean(
        pairingPreference?.requireWalkablePair ?? debug?.requireWalkablePair,
      ),
    }),
    routeDebug: debug?.route ?? null,
    counts,
    requiredPairingSuppressedFallback: toBoolean(
      debug?.requiredPairingSuppressedFallback,
    ),
    requiredPairingFailureReason: debug?.requiredPairingFailureReason ?? null,
    candidateRestaurantCountBeforeRequiredPairSuppression: toInteger(
      debug?.candidateRestaurantCountBeforeRequiredPairSuppression,
    ),
    candidateActivityCountBeforeRequiredPairSuppression: toInteger(
      debug?.candidateActivityCountBeforeRequiredPairSuppression,
    ),
    candidatePairCountBeforeRequiredPairSuppression: toInteger(
      debug?.candidatePairCountBeforeRequiredPairSuppression,
    ),
    rejectionReasons,
    suspiciousFlags: buildSuspiciousFlags({}, result, debug, normalizedIntent),
    performance: compactRecord({
      intent_parse_ms: toInteger(
        performance?.intent_parse_ms ?? performance?.intentParseMs,
      ),
      llm_ms: toInteger(performance?.llm_ms ?? performance?.llmMs),
      rpc_ms: toInteger(performance?.rpc_ms ?? performance?.rpcMs),
      pairing_ms: toInteger(performance?.pairing_ms ?? performance?.pairingMs),
      ranking_ms: toInteger(performance?.ranking_ms ?? performance?.rankingMs),
      route_check_ms: toInteger(
        performance?.route_check_ms ?? performance?.routeCheckMs,
      ),
      total_ms: toInteger(performance?.total_ms ?? performance?.totalMs),
      speed_status:
        performance?.speed_status ?? performance?.speedStatus ?? null,
      result_count: toInteger(
        performance?.result_count ?? performance?.resultCount,
      ),
      source: performance?.source ?? null,
      route: performance?.route ?? getRouteDebug(debug),
    }),
    rejectedPairs: safeSlice(debug?.rejectedPairs, 25),
    restaurantQualityScorePreview: safeSlice(
      debug?.restaurantQualityScorePreview,
      12,
    ),
    activityQualityScorePreview: safeSlice(
      debug?.activityQualityScorePreview,
      12,
    ),
    pairQualityScorePreview: safeSlice(debug?.pairQualityScorePreview, 12),
  });
}

function classifyWithReason(args: LoggerArgs, payload: any) {
  const result = args.result ?? {};
  const debug = args.debug ?? result.debug ?? {};
  const needsRestaurant = needsRestaurantForSearch(args, result, debug);
  const needsActivity = needsActivityForSearch(args, result, debug);
  const wantsPairing = wantsPairingForSearch(args, result, debug);
  const distanceMode =
    args.distanceMode ??
    payload.distance_mode ??
    debug?.distanceMode ??
    debug?.pairingPreference?.distanceMode;
  const requireWalkablePair =
    args.requireWalkablePair ??
    debug?.requireWalkablePair ??
    debug?.pairingPreference?.requireWalkablePair;
  const counters = getIssueCounters(args, debug);
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const speedStatus = String(payload.speed_status ?? "").toLowerCase();
  const timingMs = Number(payload.timing_ms ?? 0);

  if (payload.source === "admin_test_event") {
    return {
      eventType: "test_event",
      severity: "info" as const,
      eventLabel: "Admin test event",
      noPairsReason: payload.no_pairs_reason,
    };
  }
  if (errors.length > 0)
    return {
      eventType: "search_error",
      severity: "error" as const,
      eventLabel: "Search error",
      noPairsReason: payload.no_pairs_reason,
    };
  if (debug?.requiredPairingSuppressedFallback === true)
    return {
      eventType: "no_required_pair",
      severity: "warning" as const,
      eventLabel: "Required pair fallback suppressed",
      noPairsReason:
        debug?.requiredPairingFailureReason ??
        payload.no_pairs_reason ??
        "no_valid_required_pair",
    };
  if (
    payload.source === "admin_search_lab" &&
    (args.forceLog === true ||
      args.forceLogSearchHealth === true ||
      args.debugMode === true ||
      args.debugEnabled === true ||
      args.logSearchHealth === true) &&
    Number(payload.pair_count ?? 0) > 0 &&
    payload.restaurant_count === 0 &&
    payload.activity_count === 0
  ) {
    return {
      eventType: "successful_debug_run",
      severity: "info" as const,
      eventLabel: "Search Lab debug run",
      noPairsReason: payload.no_pairs_reason,
    };
  }
  if (payload.restaurant_count === 0 && needsRestaurant)
    return {
      eventType: "no_restaurant_results",
      severity: "warning" as const,
      eventLabel: "No restaurant results",
      noPairsReason: payload.no_pairs_reason,
    };
  if (payload.activity_count === 0 && needsActivity)
    return {
      eventType: "no_activity_results",
      severity: "warning" as const,
      eventLabel: "No activity results",
      noPairsReason: payload.no_pairs_reason,
    };
  if (
    wantsPairing &&
    Number(payload.restaurant_count ?? 0) > 0 &&
    Number(payload.activity_count ?? 0) > 0 &&
    payload.pair_count === 0
  ) {
    if (walkingMode(distanceMode) || requireWalkablePair === true) {
      return {
        eventType: "no_valid_pairs",
        severity: "warning" as const,
        eventLabel: "No valid pairs within walking distance",
        noPairsReason: "no_pairs_within_walking_distance",
      };
    }
    return {
      eventType: "no_valid_pairs",
      severity: "warning" as const,
      eventLabel: "No valid pairs found",
      noPairsReason: "no_valid_pairs",
    };
  }
  if (
    walkingMode(distanceMode) &&
    Number(
      payload.max_pair_walking_minutes ?? args.maxPairWalkingMinutes ?? 999,
    ) <= 5 &&
    Number(payload.pair_count ?? 0) > 0 &&
    Number(payload.pair_count ?? 0) <= 2
  ) {
    return {
      eventType: "low_pair_count",
      severity: "info" as const,
      eventLabel: "Strict walking search with limited pairs",
      noPairsReason: payload.no_pairs_reason,
    };
  }
  if (
    timingMs > SEARCH_HEALTH_SLOW_WARNING_MS ||
    SEARCH_HEALTH_SLOW_STATUSES.has(speedStatus)
  )
    return {
      eventType: "slow_search",
      severity: "warning" as const,
      eventLabel: "Slow search",
      noPairsReason: payload.no_pairs_reason,
    };
  if (
    counters.extremeWalkingRoutesRejected > 0 ||
    counters.invalidWalkingRoutesHiddenFromDisplay > 0
  )
    return {
      eventType: "walking_route_warning",
      severity: "warning" as const,
      eventLabel: "Walking route warning",
      noPairsReason: payload.no_pairs_reason,
    };
  if (counters.suppressedLowQualityPairCount > 0)
    return {
      eventType: "quality_warning",
      severity: "info" as const,
      eventLabel: "Low-quality pairs suppressed",
      noPairsReason: payload.no_pairs_reason,
    };
  if (payload.source === "admin_search_lab")
    return {
      eventType: "successful_debug_run",
      severity: "info" as const,
      eventLabel: "Search Lab debug run",
      noPairsReason: payload.no_pairs_reason,
    };
  return {
    eventType: "search_event",
    severity: "info" as const,
    eventLabel: "Search event",
    noPairsReason: payload.no_pairs_reason,
  };
}

export function classifySearchHealthEvent(input: LoggerArgs | any): {
  eventType: string;
  severity: SearchHealthSeverity;
  eventLabel: string;
} {
  const args: LoggerArgs = isLoggerArgsLikeInput(input)
    ? input
    : { result: input };
  const payload = buildSearchHealthEventPayloadBase(args);
  const classified = classifyWithReason(args, payload);
  return {
    eventType: classified.eventType,
    severity: classified.severity,
    eventLabel: classified.eventLabel,
  };
}

function isLoggerArgsLikeInput(input: any): boolean {
  if (!input || typeof input !== "object") return false;
  return Boolean(
    input.result ||
    input.debug ||
    input.source ||
    "restaurant_count" in input ||
    "activity_count" in input ||
    "pair_count" in input ||
    "needsActivity" in input ||
    "needsRestaurant" in input ||
    "wantsPairing" in input ||
    "distanceMode" in input ||
    "requireWalkablePair" in input ||
    "timing_ms" in input ||
    "timingMs" in input ||
    "speed_status" in input ||
    "speedStatus" in input ||
    "no_pairs_reason" in input ||
    "noPairsReason" in input ||
    "no_results_reason" in input ||
    "noResultsReason" in input,
  );
}

function buildSearchHealthEventPayloadBase(args: LoggerArgs) {
  const result = args.result ?? {};
  const debug = args.debug ?? result.debug ?? {};
  const normalizedIntent =
    debug?.normalizedIntent ?? result?.normalizedIntent ?? null;
  const performance = debug?.performance ?? {};
  const pairingPreference =
    debug?.pairingPreference ??
    normalizedIntent?.pairingPreference ??
    normalizedIntent?.pairing_preference ??
    null;
  const restaurantCount = inferRestaurantCount(args, result, debug);
  const activityCount = inferActivityCount(args, result, debug);
  const pairCount = inferPairCount(args, result, debug);
  const timingMs = toInteger(
    args.timingMs ??
      args.timing_ms ??
      debug?.timingMs ??
      performance?.total_ms ??
      result?.searchPerformance?.totalMs,
  );
  const speedStatus =
    args.speedStatus ??
    args.speed_status ??
    performance?.speed_status ??
    result?.searchPerformance?.speedStatus ??
    null;
  const errors = [
    ...asArray(
      args.errors ??
        debug?.errors ??
        debug?.error ??
        debug?.edge_error ??
        debug?.llmError,
    ),
    ...safeStringArray(result?.duplicateLocationErrors ?? debug?.duplicateLocationErrors, 50),
  ];
  const warnings = [
    ...asArray(args.warnings ?? debug?.warnings ?? debug?.warning),
    ...safeStringArray(result?.duplicateLocationWarnings ?? debug?.duplicateLocationWarnings, 50),
  ];
  const noResultsReason = inferNoResultsReason(
    args,
    restaurantCount,
    activityCount,
  );
  const noPairsReason =
    args.noPairsReason ??
    args.no_pairs_reason ??
    debug?.noPairsReason ??
    debug?.no_pairs_reason ??
    null;

  return {
    source: args.source ?? debug?.source ?? "search",
    environment:
      args.environment ??
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV ??
      "production",
    raw_query:
      args.rawQuery ??
      args.raw_query ??
      debug?.rawQuery ??
      normalizedIntent?.rawQuery ??
      null,
    normalized_search_type:
      normalizedIntent?.searchType ??
      normalizedIntent?.search_type ??
      result?.render_mode ??
      result?.renderMode ??
      null,
    primary_domain:
      normalizedIntent?.primaryDomain ??
      normalizedIntent?.primary_domain ??
      null,
    default_market_applied: toBoolean(debug?.defaultMarketApplied),
    default_market_id: debug?.defaultMarketId ?? null,
    distance_mode:
      args.distanceMode ??
      debug?.distanceMode ??
      pairingPreference?.distanceMode ??
      null,
    max_pair_distance_miles: toNumber(
      debug?.maxPairDistanceMiles ?? pairingPreference?.maxPairDistanceMiles,
    ),
    max_pair_walking_minutes: toNumber(
      args.maxPairWalkingMinutes ??
        debug?.maxPairWalkingMinutes ??
        pairingPreference?.maxPairWalkingMinutes,
    ),
    restaurant_count: restaurantCount,
    activity_count: activityCount,
    pair_count: pairCount,
    duplicateLocationShown: toBoolean(result?.duplicateLocationShown ?? debug?.duplicateLocationShown) ?? false,
    duplicateLocationCount: toInteger(result?.duplicateLocationCount ?? debug?.duplicateLocationCount) ?? 0,
    duplicateLocationErrors: safeStringArray(result?.duplicateLocationErrors ?? debug?.duplicateLocationErrors, 50),
    duplicateLocationWarnings: safeStringArray(result?.duplicateLocationWarnings ?? debug?.duplicateLocationWarnings, 50),
    duplicateLocationKeys: safeStringArray(result?.duplicateLocationKeys ?? debug?.duplicateLocationKeys, 50),
    pair_candidates_evaluated: toInteger(
      args.pairCandidatesEvaluated ?? debug?.pairCandidatesEvaluated,
    ),
    valid_pair_count_before_render: toInteger(
      args.validPairCountBeforeRender ?? debug?.validPairCountBeforeRender,
    ),
    no_results_reason: noResultsReason,
    no_pairs_reason: noPairsReason ? String(noPairsReason) : null,
    required_pairing_suppressed_fallback: toBoolean(
      debug?.requiredPairingSuppressedFallback,
    ),
    required_pairing_failure_reason:
      debug?.requiredPairingFailureReason ?? null,
    errors: normalizeJsonValue(errors) as unknown[],
    warnings: normalizeJsonValue(warnings) as unknown[],
    debug: buildSearchHealthDebug(result, debug),
    timing_ms: timingMs,
    speed_status: speedStatus ? String(speedStatus) : null,
    created_by_user_id: args.createdByUserId ?? args.created_by_user_id ?? null,
    beta_tester_id:
      args.betaTesterId ??
      args.beta_tester_id ??
      debug?.performance?.beta_tester_id ??
      null,
    beta_assignment_id:
      args.betaAssignmentId ??
      args.beta_assignment_id ??
      debug?.performance?.beta_assignment_id ??
      null,
  };
}

export function buildSearchHealthEventPayload(args: LoggerArgs) {
  const payload = buildSearchHealthEventPayloadBase(args);
  const classified = classifyWithReason(args, payload);
  return {
    ...payload,
    no_pairs_reason: classified.noPairsReason
      ? String(classified.noPairsReason)
      : payload.no_pairs_reason,
    event_type: classified.eventType,
    severity: classified.severity,
    event_label: classified.eventLabel,
  };
}

function shouldLogAllPublicSearchHealthEvents() {
  return process.env.SEARCH_HEALTH_LOG_ALL_PUBLIC_SEARCHES === "true";
}

export function shouldLogSearchHealthEvent(input: LoggerArgs | any): boolean {
  const args: LoggerArgs = isLoggerArgsLikeInput(input)
    ? input
    : { result: input };
  const payload = buildSearchHealthEventPayload(args);
  const debug = args.debug ?? args.result?.debug ?? {};
  const needsActivity = needsActivityForSearch(args, args.result ?? {}, debug);
  const wantsPairing = wantsPairingForSearch(args, args.result ?? {}, debug);
  const timingMs = Number(payload.timing_ms ?? 0);
  const speedStatus = String(payload.speed_status ?? "").toLowerCase();
  const counters = getIssueCounters(args, debug);
  const hasIssue =
    args.forceLog === true ||
    args.forceLogSearchHealth === true ||
    (Array.isArray(payload.errors) && payload.errors.length > 0) ||
    (Array.isArray(payload.warnings) && payload.warnings.length > 0) ||
    payload.duplicateLocationShown === true ||
    payload.restaurant_count === 0 ||
    (needsActivity && payload.activity_count === 0) ||
    (wantsPairing && payload.pair_count === 0) ||
    payload.required_pairing_suppressed_fallback === true ||
    Boolean(payload.no_results_reason) ||
    Boolean(payload.no_pairs_reason) ||
    // search_events tracks all speed data; search_health_events is only for actionable issues.
    timingMs > SEARCH_HEALTH_SLOW_WARNING_MS ||
    SEARCH_HEALTH_SLOW_STATUSES.has(speedStatus) ||
    counters.extremeWalkingRoutesRejected > 0 ||
    counters.invalidWalkingRoutesHiddenFromDisplay > 0 ||
    counters.suppressedLowQualityPairCount > 0;
  const isAdminSearchLab = payload.source === "admin_search_lab";
  const isBetaTesterSearch =
    payload.source === "beta_tester_search" || Boolean(payload.beta_tester_id);

  if (
    isAdminSearchLab &&
    (args.forceLog === true ||
      args.forceLogSearchHealth === true ||
      args.debugMode === true ||
      args.debugEnabled === true ||
      args.logSearchHealth === true)
  )
    return true;
  if (isBetaTesterSearch)
    return (
      hasIssue ||
      args.betaFeedbackSubmitted === true ||
      args.debugMode === true ||
      args.debugEnabled === true ||
      (wantsPairing && payload.pair_count === 0)
    );

  const isPublicSearch =
    payload.source === "public_create_search" ||
    payload.source === "public_explore_search" ||
    payload.source === "public_plan_search" ||
    payload.source === "search_api";

  if (isPublicSearch && shouldLogAllPublicSearchHealthEvents()) {
    return true;
  }

  return hasIssue;
}

export async function logSearchHealthEvent(
  args: LoggerArgs,
): Promise<{ ok: boolean; error?: unknown }> {
  try {
    if (!shouldLogSearchHealthEvent(args)) return { ok: true };
    const payload = buildSearchHealthEventPayload(args);
    const { error } = await supabaseAdmin
      .from("search_health_events")
      .insert(payload);
    if (error) {
      console.warn("[search-health] insert failed", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        raw_query: payload.raw_query,
        source: payload.source,
      });
      return { ok: false, error };
    }
    return { ok: true };
  } catch (error) {
    console.warn("[search-health] insert failed", error);
    return { ok: false, error };
  }
}
