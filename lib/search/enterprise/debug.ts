import { serializeSearchRankingExplanations } from "./explainability";

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

export function productionSafeDebug(debug: Record<string, unknown>) {
  if (isDevDebug()) return debug;

  const safeDebug: Record<string, unknown> = {
    search_system: "enterprise-search-v1",
    renderMode: debug.renderMode,
    timingMs: debug.timingMs,
  };

  copyAllowedKeys(safeDebug, debug, MARKET_GUARDRAIL_DEBUG_KEYS);
  copyAllowedKeys(safeDebug, debug, PRODUCTION_TELEMETRY_DEBUG_KEYS);

  if (Object.prototype.hasOwnProperty.call(debug, "searchQualityRanking")) {
    Object.assign(
      safeDebug,
      serializeSearchRankingExplanations(debug.searchQualityRanking),
    );
  }

  return safeDebug;
}
