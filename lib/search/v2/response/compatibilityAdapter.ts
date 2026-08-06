import type { PublicSearchResponseV2 } from "./responseTypes";

export function adaptV2ResponseToCurrentPublicContract(v2: PublicSearchResponseV2) {
  const promotedPairs = v2.pairs.map((pair) =>
    pair.isFallbackPair ? { ...pair, isFallbackPair: false } : pair,
  );
  const mixedPairRequired =
    v2.searchPlan.restaurant.required && v2.searchPlan.activity.required;
  const noCompatiblePair =
    mixedPairRequired &&
    promotedPairs.length === 0 &&
    (v2.restaurants.length > 0 || v2.activities.length > 0);
  const truthfulRequestFulfilled = noCompatiblePair
    ? false
    : v2.requestFulfilled;
  const truthfulPartialResults = noCompatiblePair
    ? true
    : v2.partialResults;
  const terminalOutcome = noCompatiblePair
    ? "no_compatible_pair"
    : v2.outcome;
  const cards = [
    ...promotedPairs,
    ...v2.sameVenueResults,
    ...v2.restaurants,
    ...v2.activities,
  ];
  const hasMixedSections =
    promotedPairs.length > 0 &&
    (v2.restaurants.length > 0 || v2.activities.length > 0);
  const renderMode = hasMixedSections
    ? "mixed_results"
    : noCompatiblePair
      ? "partial_mixed"
      : v2.displayMode;
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
  const fallbackReason =
    v2.fallback.reason ??
    (noCompatiblePair ? "no_compatible_pair" : null) ??
    (v2.retrieval.legacyFallbackUsed ? "canonical_profile_lane_empty" : null);
  const fallbackDiagnostics = {
    used: Boolean(
      v2.fallback.used ||
        v2.retrieval.legacyFallbackUsed ||
        promotedPairCount ||
        noCompatiblePair,
    ),
    reason: fallbackReason,
    affectedDomains: [...v2.retrieval.fallbackDomains],
    retrievalSource: v2.retrieval.servedSource,
    legacyLaneRecoveryUsed: v2.retrieval.legacyFallbackUsed,
    promotedPairCount,
    broaderGeoUsed:
      v2.geoResolution?.servedTier === "nearby_radius" ||
      v2.geoResolution?.servedTier === "broader_fallback",
  };
  const rawActivityCandidateCount =
    Number(v2.debug?.candidateStages?.finalActivityCandidates ?? 0) ||
    Number(v2.retrieval?.profileCandidateCount ?? 0);
  const rawRestaurantCandidateCount =
    Number(v2.debug?.candidateStages?.finalRestaurantCandidates ?? 0) ||
    Number(v2.retrieval?.profileCandidateCount ?? 0);
  const pairCandidatesEvaluated = Number(
    v2.debug?.pairingDebug?.pairCandidatesEvaluated ?? 0,
  );
  const searchTelemetry = {
    rawRestaurantCandidateCount,
    rawActivityCandidateCount,
    pairCandidatesEvaluated,
    validPairCountBeforeRender: Number(
      v2.debug?.pairingDebug?.validPairCountBeforeRender ?? promotedPairs.length,
    ),
    renderEligiblePairCount: promotedPairs.length,
    finalDisplayedResultCount: cards.length,
  };

  return {
    success: noCompatiblePair ? false : v2.success,
    reply: noCompatiblePair
      ? "We found restaurant and activity options, but no compatible pair satisfied the final pairing rules."
      : v2.message,
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
    render_mode: renderMode,
    renderMode,
    outcome: terminalOutcome,
    primary_domain: v2.primary_domain,
    primaryDomain: v2.primaryDomain,
    primaryResultType: renderMode,
    restaurant_count: v2.restaurants.length,
    activity_count: v2.activities.length,
    builder_restaurant_count: v2.counts.builderRestaurantCards,
    builder_activity_count: v2.counts.builderActivityCards,
    unique_pair_restaurant_count: v2.counts.uniquePairRestaurants,
    unique_pair_activity_count: v2.counts.uniquePairActivities,
    pair_count: promotedPairs.length,
    fallback_pair_count: 0,
    promoted_pair_count: promotedPairCount,
    fallbackPairsUsedAsPrimary: false,
    fallbackDiagnostics,
    matched_location_count: v2.sameVenueResults.length,
    result_count: cards.length,
    rawActivityCandidateCount,
    rawRestaurantCandidateCount,
    pairCandidatesEvaluated,
    searchTelemetry,
    card_counts: {
      restaurants: v2.restaurants.length,
      activities: v2.activities.length,
      builder_restaurants: v2.counts.builderRestaurantCards,
      builder_activities: v2.counts.builderActivityCards,
      matched_locations: v2.sameVenueResults.length,
      pairs: promotedPairs.length,
      cards: cards.length,
    },
    cardCounts: {
      restaurants: v2.restaurants.length,
      activities: v2.activities.length,
      builderRestaurants: v2.counts.builderRestaurantCards,
      builderActivities: v2.counts.builderActivityCards,
      matched_locations: v2.sameVenueResults.length,
      pairs: promotedPairs.length,
      cards: cards.length,
    },
    requestId: v2.requestId,
    searchCoreVersion: "v2",
    assignedEngine: "v2",
    searchCoreAssignment: {
      engine: "v2",
      reason: "v2_primary",
      percentage: 100,
    },
    requestFulfilled: truthfulRequestFulfilled,
    partialResults: truthfulPartialResults,
    fallback: {
      ...v2.fallback,
      used: fallbackDiagnostics.used,
      reason: fallbackReason,
      details: fallbackDiagnostics,
    },
    geoResolution: v2.geoResolution,
    geo_resolution: v2.geoResolution,
    timing: v2.timing,
    ml: v2.ml,
    debug: {
      searchCoreVersion: "v2",
      assignedEngine: "v2",
      searchCoreAssignment: {
        engine: "v2",
        reason: "v2_primary",
        percentage: 100,
      },
      requestedMode: v2.requestedMode,
      resolvedMode: v2.resolvedMode,
      displayMode: renderMode,
      primaryDomain: v2.primaryDomain,
      primary_domain: v2.primary_domain,
      primaryResultType: renderMode,
      terminalOutcome,
      canonicalCounts: {
        ...v2.counts,
        restaurantCards: v2.restaurants.length,
        activityCards: v2.activities.length,
        pairs: promotedPairs.length,
        displayedResults: cards.length,
      },
      rawActivityCandidateCount,
      rawRestaurantCandidateCount,
      pairCandidatesEvaluated,
      searchTelemetry,
      pairingDebug: v2.debug?.pairingDebug ?? null,
      candidateStages: v2.debug?.candidateStages ?? null,
      inventoryAudit: v2.debug?.inventoryAudit ?? null,
      finalDisplayedResultCount: cards.length,
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
      requestFulfilled: truthfulRequestFulfilled,
      partialResults: truthfulPartialResults,
      fallback: {
        ...v2.fallback,
        used: fallbackDiagnostics.used,
        reason: fallbackReason,
        details: fallbackDiagnostics,
      },
      geoResolution: v2.geoResolution,
    },
    searchV2: {
      ...v2,
      success: noCompatiblePair ? false : v2.success,
      requestFulfilled: truthfulRequestFulfilled,
      partialResults: truthfulPartialResults,
      outcome: terminalOutcome,
      pairs: promotedPairs,
      displayMode: renderMode,
      counts: {
        ...v2.counts,
        restaurantCards: v2.restaurants.length,
        activityCards: v2.activities.length,
        pairs: promotedPairs.length,
        displayedResults: cards.length,
      },
    },
  };
}
