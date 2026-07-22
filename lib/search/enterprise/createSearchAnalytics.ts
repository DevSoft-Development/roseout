export type CreateSearchAnalyticsCounts = {
  restaurants: number;
  activities: number;
  pairs: number;
  cards?: number;
  finalDisplayedResultCount?: number;
  pairCandidatesEvaluated?: number | null;
  validPairCountBeforeRender?: number | null;
  candidatePairCountBeforeRequiredPairSuppression?: number | null;
  pairsRejectedForDistance?: number | null;
  pairsRejectedForMissingCoordinates?: number | null;
  extremeWalkingRoutesRejected?: number | null;
  invalidWalkingRoutesHiddenFromDisplay?: number | null;
  pairQualityScorePreview?: unknown;
};

type AnalyticsArgs = {
  result: any;
  responsePayload?: any;
  debug?: any;
  counts: CreateSearchAnalyticsCounts;
  canonicalGeo?: Record<string, any> | null;
  selectedSearchLane?: string | null;
};

function objectOrNull(value: unknown): Record<string, any> | null {
  return value && typeof value === "object"
    ? (value as Record<string, any>)
    : null;
}

function firstObject(...values: unknown[]): Record<string, any> | null {
  for (const value of values) {
    const object = objectOrNull(value);
    if (object) return object;
  }
  return null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function canonicalIntentForMode(mode: unknown): Record<string, any> | null {
  const normalized = nonEmptyString(mode)?.toLowerCase().replace(/-/g, "_");
  if (!normalized) return null;
  if (["restaurant", "restaurant_only"].includes(normalized)) {
    return {
      searchType: "restaurant_only",
      primaryDomain: "restaurant",
      needsRestaurant: true,
      needsActivity: false,
      wantsPairing: false,
    };
  }
  if (["activity", "activity_only"].includes(normalized)) {
    return {
      searchType: "activity_only",
      primaryDomain: "activity",
      needsRestaurant: false,
      needsActivity: true,
      wantsPairing: false,
    };
  }
  if (
    ["mixed", "mixed_outing", "same_location_combo", "paired_outing"].includes(
      normalized,
    )
  ) {
    return {
      searchType: normalized === "mixed" ? "mixed_outing" : normalized,
      primaryDomain: "mixed",
      needsRestaurant: true,
      needsActivity: true,
      wantsPairing: true,
    };
  }
  if (normalized === "anchored_restaurant") {
    return {
      searchType: "anchored_nearby",
      primaryDomain: "restaurant",
      needsRestaurant: true,
      needsActivity: false,
      wantsPairing: false,
    };
  }
  if (normalized === "anchored_activity") {
    return {
      searchType: "anchored_nearby",
      primaryDomain: "activity",
      needsRestaurant: false,
      needsActivity: true,
      wantsPairing: false,
    };
  }
  return null;
}

export function resolveCreateSearchAnalyticsGeo(args: {
  normalizedIntent?: Record<string, any> | null;
  result?: any;
  responsePayload?: any;
  debug?: any;
  canonicalGeo?: Record<string, any> | null;
}) {
  const debug = args.debug ?? args.result?.debug ?? {};
  const canonicalGeo =
    args.canonicalGeo ??
    debug?.canonicalGeo ??
    debug?.debugParity?.canonicalGeo ??
    null;
  const sources = [
    objectOrNull(canonicalGeo),
    objectOrNull(args.responsePayload?.geo),
    objectOrNull(args.result?.geo),
    objectOrNull(debug?.originalGeo),
    objectOrNull(debug?.geo),
    objectOrNull(debug?.effectiveGeo),
    objectOrNull(args.normalizedIntent?.geo),
  ].filter(Boolean) as Record<string, any>[];
  if (sources.length === 0) return null;
  const merged: Record<string, any> = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value != null) merged[key] = value;
    }
  }
  return merged;
}

export function extractCreateSearchNormalizedIntent(
  result: any,
  debug: any = result?.debug,
) {
  return firstObject(
    debug?.normalizedIntent,
    debug?.intent,
    result?.normalizedIntent,
    result?.debug?.normalizedIntent,
    result?.debug?.intent,
    result?.intent,
    result?.parsedIntent,
    result?.parsed_intent,
    result?.debug?.parsedIntent,
    result?.debug?.parsed_intent,
  );
}

export function inferCreateSearchIntentFromResult({
  result,
  responsePayload = result,
  debug = result?.debug,
  counts,
  selectedSearchLane,
}: AnalyticsArgs) {
  const laneIntent = canonicalIntentForMode(
    selectedSearchLane ??
      debug?.selectedSearchLane ??
      debug?.debugParity?.selectedSearchLane,
  );
  const typedIntent = canonicalIntentForMode(
    debug?.searchType ??
      debug?.debugParity?.searchType ??
      result?.searchType ??
      responsePayload?.searchType,
  );
  const renderMode =
    responsePayload?.render_mode ??
    responsePayload?.renderMode ??
    result?.render_mode ??
    result?.renderMode ??
    debug?.render_mode ??
    debug?.renderMode ??
    null;
  const renderIntent =
    renderMode === "mixed_pairs" || renderMode === "partial_mixed"
      ? canonicalIntentForMode("mixed")
      : null;
  const base = laneIntent ?? typedIntent ?? renderIntent;
  if (!base) return null;
  const restaurantCount = counts.restaurants ?? 0;
  const activityCount = counts.activities ?? 0;
  return {
    ...base,
    wantsPairing:
      boolOrNull(debug?.wantsPairing) ??
      boolOrNull(debug?.debugParity?.wantsPairing) ??
      base.wantsPairing,
    needsRestaurant:
      boolOrNull(debug?.needsRestaurant) ??
      boolOrNull(debug?.debugParity?.needsRestaurant) ??
      base.needsRestaurant,
    needsActivity:
      boolOrNull(debug?.needsActivity) ??
      boolOrNull(debug?.debugParity?.needsActivity) ??
      base.needsActivity,
    pairingPreference: debug?.pairingPreference ?? null,
    geo: resolveCreateSearchAnalyticsGeo({
      result,
      responsePayload,
      debug,
      canonicalGeo: debug?.canonicalGeo ?? debug?.debugParity?.canonicalGeo,
    }),
    inferredFromRenderMode: renderIntent ? renderMode : undefined,
    resultCountsObserved: {
      restaurants: restaurantCount,
      activities: activityCount,
      pairs: counts.pairs ?? 0,
    },
  };
}

export function getCreateSearchAnalyticsIntent(
  args: AnalyticsArgs,
): Record<string, any> | null {
  const extracted = extractCreateSearchNormalizedIntent(
    args.result,
    args.debug,
  );
  const fallback = inferCreateSearchIntentFromResult(args);
  const base = (extracted ?? fallback) as Record<string, any> | null;
  if (!base) return null;
  const canonical = (canonicalIntentForMode(
    base.searchType ?? base.normalizedIntent ?? args.selectedSearchLane,
  ) ??
    fallback ??
    {}) as Record<string, any>;
  return {
    ...base,
    searchType: base.searchType ?? canonical.searchType ?? null,
    primaryDomain: base.primaryDomain ?? canonical.primaryDomain ?? null,
    wantsPairing:
      boolOrNull(base.wantsPairing) ?? canonical.wantsPairing ?? null,
    needsRestaurant:
      boolOrNull(base.needsRestaurant) ?? canonical.needsRestaurant ?? null,
    needsActivity:
      boolOrNull(base.needsActivity) ?? canonical.needsActivity ?? null,
    pairingPreference:
      base.pairingPreference ?? args.debug?.pairingPreference ?? null,
    geo: resolveCreateSearchAnalyticsGeo({
      normalizedIntent: base,
      result: args.result,
      responsePayload: args.responsePayload,
      debug: args.debug,
      canonicalGeo: args.canonicalGeo,
    }),
    intentParserSource:
      base.intentParserSource ??
      base.parserSource ??
      args.debug?.intentParserSource ??
      args.debug?.debugParity?.intentParserSource ??
      null,
  };
}

export function buildCreateSearchDebugParity(args: {
  route?: string;
  rawQueryReceived: string;
  cleanedQuery: string;
  rawQueryBeforeNearMeStrip?: string | null;
  rawQueryAfterNearMeStrip?: string | null;
  nearMeIntent?: boolean;
  typedLocationIntent?: boolean;
  useCurrentLocation?: boolean;
  userLatitudePresent?: boolean;
  userLongitudePresent?: boolean;
  searchBackendUsed?: string | null;
  resolvedMarket?: string | null;
  allowedMarkets?: unknown;
  explicitMarketRequested?: boolean;
  explicitGeoRequested?: boolean;
  canonicalLatitudePresent?: boolean;
  canonicalLongitudePresent?: boolean;
  userLocationUsedAsPrimaryGeo?: boolean;
  userLocationUsedAsSoftBoost?: boolean;
  analyticsIntent?: any;
  renderMode?: string | null;
  counts: CreateSearchAnalyticsCounts;
  intentParserSource?: string | null;
  existing?: Record<string, any>;
  [key: string]: any;
}) {
  const canonicalGeo =
    args.analyticsIntent?.geo ?? args.existing?.canonicalGeo ?? null;
  return {
    ...(args.existing ?? {}),
    route: args.route ?? "/api/generate",
    rawQueryReceived: args.rawQueryReceived,
    cleanedQuery: args.cleanedQuery,
    rawQueryBeforeNearMeStrip: args.rawQueryBeforeNearMeStrip,
    rawQueryAfterNearMeStrip: args.rawQueryAfterNearMeStrip,
    nearMeIntent: args.nearMeIntent,
    typedLocationIntent: args.typedLocationIntent,
    useCurrentLocation: args.useCurrentLocation,
    userLatitudePresent: args.userLatitudePresent,
    userLongitudePresent: args.userLongitudePresent,
    canonicalLatitudePresent:
      args.canonicalLatitudePresent ?? canonicalGeo?.latitude != null,
    canonicalLongitudePresent:
      args.canonicalLongitudePresent ?? canonicalGeo?.longitude != null,
    userLocationUsedAsPrimaryGeo:
      args.userLocationUsedAsPrimaryGeo ??
      args.existing?.userLocationUsedAsPrimaryGeo,
    userLocationUsedAsSoftBoost:
      args.userLocationUsedAsSoftBoost ??
      args.existing?.userLocationUsedAsSoftBoost,
    searchBackendUsed: args.searchBackendUsed,
    resolvedMarket: args.resolvedMarket,
    allowedMarkets: args.allowedMarkets,
    explicitMarketRequested: args.explicitMarketRequested,
    explicitGeoRequested:
      args.explicitGeoRequested ?? args.explicitMarketRequested,
    geo: canonicalGeo,
    parsed_city: canonicalGeo?.city ?? null,
    parsed_borough: canonicalGeo?.borough ?? null,
    parsed_market:
      canonicalGeo?.resolvedMarket ??
      canonicalGeo?.market ??
      args.resolvedMarket ??
      null,
    requestedMarket:
      canonicalGeo?.requestedMarket ?? args.existing?.requestedMarket ?? null,
    searchType: args.analyticsIntent?.searchType ?? null,
    primaryDomain: args.analyticsIntent?.primaryDomain ?? null,
    wantsPairing: args.analyticsIntent?.wantsPairing ?? null,
    needsRestaurant: args.analyticsIntent?.needsRestaurant ?? null,
    needsActivity: args.analyticsIntent?.needsActivity ?? null,
    renderMode: args.renderMode,
    restaurantCount: args.counts.restaurants,
    activityCount: args.counts.activities,
    pairCount: args.counts.pairs,
    resultCount:
      args.counts.finalDisplayedResultCount ??
      args.counts.restaurants + args.counts.activities + args.counts.pairs,
    intentParserSource: args.intentParserSource ?? null,
  };
}
