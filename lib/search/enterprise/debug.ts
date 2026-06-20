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

export function isDevDebug() {
  return process.env.NODE_ENV !== "production";
}

export function productionSafeDebug(debug: Record<string, unknown>) {
  if (isDevDebug()) return debug;

  const safeDebug: Record<string, unknown> = {
    search_system: "enterprise-search-v1",
    renderMode: debug.renderMode,
    timingMs: debug.timingMs,
  };

  for (const key of MARKET_GUARDRAIL_DEBUG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(debug, key)) {
      safeDebug[key] = debug[key];
    }
  }

  return safeDebug;
}
