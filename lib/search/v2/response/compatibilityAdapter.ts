import type { PublicSearchResponseV2 } from "./responseTypes";

export function adaptV2ResponseToCurrentPublicContract(v2: PublicSearchResponseV2) {
  const cards = v2.displayMode === "pairs" ? [] : [...v2.sameVenueResults, ...v2.restaurants, ...v2.activities];
  const anchorLocation = v2.anchor.location;
  const searchContext = v2.anchor.requested
    ? {
        mode: "anchored_nearby",
        heading: anchorLocation?.name
          ? `Options near ${anchorLocation.name}`
          : v2.anchor.rawName
            ? `Options near ${v2.anchor.rawName}`
            : "Options near your anchor",
        anchor_position: "before_results",
        anchor_requested: true,
        anchor_resolved: v2.anchor.resolved,
        anchor_relationship: v2.anchor.relationship,
      }
    : null;
  const promotedPairCount = v2.pairs.filter((pair) => pair.isFallbackPair).length;
  const fallbackReason = v2.fallback.reason ?? (v2.retrieval.legacyFallbackUsed ? "canonical_profile_lane_empty" : null);
  const fallbackDiagnostics = {
    used: Boolean(v2.fallback.used || v2.retrieval.legacyFallbackUsed || promotedPairCount),
    reason: fallbackReason,
    affectedDomains: [...v2.retrieval.fallbackDomains],
    retrievalSource: v2.retrieval.servedSource,
    legacyLaneRecoveryUsed: v2.retrieval.legacyFallbackUsed,
    promotedPairCount,
    broaderGeoUsed: v2.geoResolution?.servedTier === "nearby_radius" || v2.geoResolution?.servedTier === "broader_fallback",
  };
  const promotedPairs = v2.pairs.map((pair) => pair.isFallbackPair ? { ...pair, isFallbackPair: false } : pair);

  return {
    success: v2.success,
    reply: v2.message,
    restaurants: v2.restaurants,
    activities: v2.activities,
    matched_locations: v2.sameVenueResults,
    matchedLocations: v2.sameVenueResults,
    pairs: promotedPairs,
    builder: v2.builder,
    builder_restaurants: v2.builder.restaurants,
    builder_activities: v2.builder.activities,
    anchor: v2.anchor,
    anchor_location: anchorLocation,
    anchorLocation,
    search_context: searchContext,
    searchContext,
    cards,
    render_mode: v2.displayMode,
    renderMode: v2.displayMode,
    primary_domain: v2.primary_domain,
    primaryDomain: v2.primaryDomain,
    primaryResultType: v2.displayMode,
    restaurant_count: v2.counts.restaurantCards,
    activity_count: v2.counts.activityCards,
    builder_restaurant_count: v2.counts.builderRestaurantCards,
    builder_activity_count: v2.counts.builderActivityCards,
    unique_pair_restaurant_count: v2.counts.uniquePairRestaurants,
    unique_pair_activity_count: v2.counts.uniquePairActivities,
    pair_count: v2.counts.pairs,
    fallback_pair_count: 0,
    promoted_pair_count: promotedPairCount,
    fallbackPairsUsedAsPrimary: false,
    fallbackDiagnostics,
    matched_location_count: v2.counts.sameVenueCards,
    result_count: v2.counts.displayedResults,
    card_counts: {
      restaurants: v2.counts.restaurantCards,
      activities: v2.counts.activityCards,
      builder_restaurants: v2.counts.builderRestaurantCards,
      builder_activities: v2.counts.builderActivityCards,
      matched_locations: v2.counts.sameVenueCards,
      pairs: v2.counts.pairs,
    },
    cardCounts: {
      restaurants: v2.counts.restaurantCards,
      activities: v2.counts.activityCards,
      builderRestaurants: v2.counts.builderRestaurantCards,
      builderActivities: v2.counts.builderActivityCards,
      matched_locations: v2.counts.sameVenueCards,
      pairs: v2.counts.pairs,
    },
    requestId: v2.requestId,
    searchCoreVersion: "v2",
    requestFulfilled: v2.requestFulfilled,
    partialResults: v2.partialResults,
    fallback: { ...v2.fallback, details: fallbackDiagnostics },
    geoResolution: v2.geoResolution,
    geo_resolution: v2.geoResolution,
    timing: v2.timing,
    ml: v2.ml,
    debug: {
      searchCoreVersion: "v2",
      requestedMode: v2.requestedMode,
      resolvedMode: v2.resolvedMode,
      displayMode: v2.displayMode,
      primaryDomain: v2.primaryDomain,
      primary_domain: v2.primary_domain,
      primaryResultType: v2.displayMode,
      canonicalCounts: v2.counts,
      fallbackPairCount: 0,
      promotedPairCount,
      fallbackPairsUsedAsPrimary: false,
      fallbackDiagnostics,
      builderEnabled: v2.builder.enabled,
      builderRestaurantCount: v2.counts.builderRestaurantCards,
      builderActivityCount: v2.counts.builderActivityCards,
      uniquePairRestaurantCount: v2.counts.uniquePairRestaurants,
      uniquePairActivityCount: v2.counts.uniquePairActivities,
      anchorRequested: v2.anchor.requested,
      anchorResolved: v2.anchor.resolved,
      requestFulfilled: v2.requestFulfilled,
      partialResults: v2.partialResults,
      fallback: { ...v2.fallback, details: fallbackDiagnostics },
      geoResolution: v2.geoResolution,
    },
    searchV2: { ...v2, pairs: promotedPairs },
  };
}
