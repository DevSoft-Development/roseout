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
};

function objectOrNull(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" ? (value as Record<string, any>) : null;
}

function firstObject(...values: unknown[]): Record<string, any> | null {
  for (const value of values) {
    const object = objectOrNull(value);
    if (object) return object;
  }
  return null;
}

function hasArray(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

export function extractCreateSearchNormalizedIntent(result: any, debug: any = result?.debug) {
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

export function inferCreateSearchIntentFromResult({ result, responsePayload = result, debug = result?.debug, counts }: AnalyticsArgs) {
  const renderMode =
    responsePayload?.render_mode ??
    responsePayload?.renderMode ??
    result?.render_mode ??
    result?.renderMode ??
    debug?.render_mode ??
    debug?.renderMode ??
    null;
  if (renderMode !== "mixed_pairs" && renderMode !== "partial_mixed") return null;

  const restaurantCount = counts.restaurants ?? 0;
  const activityCount = counts.activities ?? 0;
  return {
    searchType: "mixed_outing",
    primaryDomain: "mixed",
    wantsPairing: true,
    needsRestaurant: restaurantCount > 0 || hasArray(result?.restaurants) || hasArray(responsePayload?.restaurants),
    needsActivity: activityCount > 0 || hasArray(result?.activities) || hasArray(responsePayload?.activities),
    pairingPreference: debug?.pairingPreference ?? null,
    geo: debug?.effectiveGeo ?? debug?.geo ?? result?.geo ?? responsePayload?.geo ?? null,
    inferredFromRenderMode: renderMode,
  };
}

export function getCreateSearchAnalyticsIntent(args: AnalyticsArgs): Record<string, any> | null {
  return extractCreateSearchNormalizedIntent(args.result, args.debug) ?? inferCreateSearchIntentFromResult(args);
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
  analyticsIntent?: any;
  renderMode?: string | null;
  counts: CreateSearchAnalyticsCounts;
  intentParserSource?: string | null;
  existing?: Record<string, any>;
}) {
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
    searchBackendUsed: args.searchBackendUsed,
    resolvedMarket: args.resolvedMarket,
    allowedMarkets: args.allowedMarkets,
    explicitMarketRequested: args.explicitMarketRequested,
    searchType: args.analyticsIntent?.searchType ?? null,
    primaryDomain: args.analyticsIntent?.primaryDomain ?? null,
    wantsPairing: args.analyticsIntent?.wantsPairing ?? null,
    needsRestaurant: args.analyticsIntent?.needsRestaurant ?? null,
    needsActivity: args.analyticsIntent?.needsActivity ?? null,
    renderMode: args.renderMode,
    restaurantCount: args.counts.restaurants,
    activityCount: args.counts.activities,
    pairCount: args.counts.pairs,
    resultCount: args.counts.finalDisplayedResultCount ?? args.counts.restaurants + args.counts.activities + args.counts.pairs,
    intentParserSource: args.intentParserSource ?? null,
  };
}
