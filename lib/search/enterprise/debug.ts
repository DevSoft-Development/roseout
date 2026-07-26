import {
  buildSearchExplanationsFromQualityRanking,
  serializeSearchExplanations,
} from "./searchExplainability";

const MARKET_GUARDRAIL_DEBUG_KEYS = [
  "rankedRestaurantCountBeforeMarketGuardrail",
  "rankedActivityCountBeforeMarketGuardrail",
  "marketSafeRestaurantCount",
  "marketSafeActivityCount",
  "photoSafeRestaurantCount",
  "photoSafeActivityCount",
  "photoSuppressedRestaurantCount",
  "photoSuppressedActivityCount",
  "marketGuardrailRejected",
  "suppressedMarketMismatchCount",
  "sampleRejectedMarkets",
  "samplePhotoSuppressedRestaurants",
  "samplePhotoSuppressedActivities",
  "finalDisplayedResultCount",
] as const;

const PRODUCTION_TELEMETRY_DEBUG_KEYS = [
  "intentParserSource",
  "parser_source",
  "searchMode",
  "normalizedIntentLabel",
  "searchType",
  "primaryDomain",
  "wantsPairing",
  "needsRestaurant",
  "needsActivity",
  "normalizedIntent",
  "geo",
  "originalGeo",
  "effectiveGeo",
  "resolvedMarket",
  "explicitMarketRequested",
  "pairingPreference",
  "pairCandidatesEvaluated",
  "validPairCountBeforeRender",
  "candidateRestaurantCountBeforeRequiredPairSuppression",
  "candidateActivityCountBeforeRequiredPairSuppression",
  "candidatePairCountBeforeRequiredPairSuppression",
  "pairsRejectedForDistance",
  "pairsRejectedForWalkingMinutes",
  "pairsRejectedForMissingCoordinates",
  "walkingPairsHiddenOverLimit",
  "walkingPairRejectReasons",
  "extremeWalkingRoutesRejected",
  "invalidWalkingRoutesHiddenFromDisplay",
  "walkablePairsFound",
  "maxPairDistanceMiles",
  "maxPairWalkingMinutes",
  "requireWalkablePair",
  "distanceMode",
  "pairRecoveryAttempted",
  "pairRecoveryCandidatesEvaluated",
  "pairRecoveryCount",
  "pairRecoveryCapMiles",
  "pairRecoveryMs",
  "rawCandidateCount",
  "rawActivityCandidateCount",
  "qualifiedRestaurantCount",
  "qualifiedActivityCount",
  "fallbackActivityCount",
  "primaryPairCount",
  "pair_count",
  "fallback_pair_count",
  "fallbackPairsUsedAsPrimary",
  "primaryResultType",
  "renderMode",
  "timingMs",
  "performance",
  "mlSearchDebug",
  "searchQualityRanking",
  "searchExplanations",
] as const;

export function isDevDebug() {
  return process.env.NODE_ENV !== "production";
}

function copyAllowedKeys(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  keys: readonly string[],
) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      target[key] = source[key];
    }
  }
}

function productionExplanations(debug: Record<string, unknown>) {
  const explicit = serializeSearchExplanations(debug.searchExplanations, 50);
  if (explicit.length) return explicit;
  return buildSearchExplanationsFromQualityRanking(
    debug.searchQualityRanking,
    50,
  );
}

export function productionSafeDebug(debug: Record<string, unknown>) {
  if (isDevDebug()) {
    if (!Array.isArray(debug.searchExplanations)) {
      const explanations = buildSearchExplanationsFromQualityRanking(
        debug.searchQualityRanking,
        50,
      );
      if (explanations.length) debug.searchExplanations = explanations;
    }
    return debug;
  }

  const safeDebug: Record<string, unknown> = {
    search_system: "enterprise-search-v1",
    renderMode: debug.renderMode,
    timingMs: debug.timingMs,
  };

  copyAllowedKeys(safeDebug, debug, MARKET_GUARDRAIL_DEBUG_KEYS);
  copyAllowedKeys(safeDebug, debug, PRODUCTION_TELEMETRY_DEBUG_KEYS);

  const explanations = productionExplanations(debug);
  if (explanations.length) safeDebug.searchExplanations = explanations;

  return safeDebug;
}
