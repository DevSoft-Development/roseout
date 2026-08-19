import type { PublicLocationCard, PublicSearchResponseV2 } from "./responseTypes";

function hideStandaloneDistance(card: PublicLocationCard): PublicLocationCard {
  return { ...card, distance_miles: null, pair_distance_miles: null };
}

function roundedPairDistance(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

export function adaptV2ResponseToCurrentPublicContract(v2: PublicSearchResponseV2) {
  const restaurants = v2.restaurants.map(hideStandaloneDistance);
  const activities = v2.activities.map(hideStandaloneDistance);
  const sameVenueResults = v2.sameVenueResults.map(hideStandaloneDistance);
  const promotedPairs = v2.pairs.map((pair) => {
    const pairDistanceMiles = roundedPairDistance(pair.distanceMiles);
    return {
      ...pair,
      isFallbackPair: false,
      distanceMiles: pairDistanceMiles,
      pair_distance_miles: pairDistanceMiles,
      restaurant: {
        ...hideStandaloneDistance(pair.restaurant),
        pair_distance_miles: pairDistanceMiles,
      },
      activity: {
        ...hideStandaloneDistance(pair.activity),
        pair_distance_miles: pairDistanceMiles,
      },
    };
  });
  const mixedPairRequired = Boolean(v2.searchPlan.pairing.required);
  const noCompatiblePair =
    mixedPairRequired &&
    promotedPairs.length === 0 &&
    (restaurants.length > 0 || activities.length > 0);
  const truthfulRequestFulfilled = noCompatiblePair
    ? false
    : v2.requestFulfilled;
  const truthfulPartialResults = noCompatiblePair
    ? true
    : v2.partialResults;
  const terminalOutcome = noCompatiblePair
    ? "no_compatible_pair"
    : v2.outcome;
  const noPairsReason =
    mixedPairRequired && promotedPairs.length === 0
      ? v2.debug?.pairingDebug?.primaryFailure ?? "no_compatible_pair"
      : null;
  const cards = [
    ...promotedPairs,
    ...sameVenueResults,
    ...restaurants,
    ...activities,
  ];
  const hasMixedSections =
    promotedPairs.length > 0 &&
    (restaurants.length > 0 || activities.length > 0);
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
  const candidateStages = v2.debug?.candidateStages ?? null;
  const activityCandidateRejections =
    candidateStages?.rejectedCandidates?.filter(
      (candidate: any) => candidate?.desiredRole === "activity",
    ) ?? [];
  const rawActivityCandidateCount =
    Number(candidateStages?.finalActivityCandidates ?? 0) ||
    Number(v2.retrieval?.profileCandidateCount ?? 0);
  const rawRestaurantCandidateCount =
    Number(candidateStages?.finalRestaurantCandidates ?? 0) ||
    Number(v2.retrieval?.profileCandidateCount ?? 0);
  const pairCandidatesEvaluated = Number(
    v2.debug?.pairingDebug?.pairCandidatesEvaluated ?? 0,
  );
  const rawValidPairCountBeforeRender = Number(
    v2.debug?.pairingDebug?.validPairCountBeforeRender ?? 0,
  );
  const validPairCountBeforeRender = Number(
    v2.debug?.pairingDebug?.renderEligiblePairCount ??
      v2.debug?.pairingDebug?.validPairCountAfterDiversification ??
      promotedPairs.length,
  );
  const normalizedIntent = {
    searchType: v2.resolvedMode,
    primaryDomain: v2.primaryDomain,
    needsRestaurant: Boolean(v2.searchPlan.restaurant.required),
    needsActivity: Boolean(v2.searchPlan.activity.required),
    wantsPairing: mixedPairRequired,
    restaurantTerms: [
      ...(v2.searchPlan.restaurant.cuisines ?? []),
      ...(v2.searchPlan.restaurant.foods ?? []),
      ...(v2.searchPlan.restaurant.features ?? []),
    ],
    activityTerms: [
      ...(v2.searchPlan.activity.categories ?? []),
      ...(v2.searchPlan.activity.features ?? []),
    ],
    intentParserSource: "v2_planner",
  };
  const searchTelemetry = {
    rawRestaurantCandidateCount,
    rawActivityCandidateCount,
    pairCandidatesEvaluated,
    rawValidPairCountBeforeRender,
    validPairCountBeforeRender,
    renderEligiblePairCount: promotedPairs.length,
    finalDisplayedResultCount: cards.length,
    activityCandidateRejectionCount: activityCandidateRejections.length,
  };

  return {
    success: noCompatiblePair ? false : v2.success,
    reply: noCompatiblePair
      ? "We found restaurant and activity options, but no compatible pair satisfied the final pairing rules."
      : v2.message,
    restaurants,
    activities,
    matched_locations: sameVenueResults,
    matchedLocations: sameVenueResults,
    pairs: promotedPairs,
    builder: v2.builder,
    builder_restaurants: v2.builder.restaurants.map(hideStandaloneDistance),
    builder_activities: v2.builder.activities.map(hideStandaloneDistance),
    anchor: v2.anchor,
    anchor_location: anchorLocation,
    anchorLocation,
    search_context: searchContext,
    searchContext,
    cards,
    render_mode: renderMode,
    renderMode,
    outcome: terminalOutcome,
    no_pairs_reason: noPairsReason,
    primary_domain: v2.primary_domain,
    primaryDomain: v2.primaryDomain,
    primaryResultType: renderMode,
    restaurant_count: restaurants.length,
    activity_count: activities.length,
    builder_restaurant_count: v2.counts.builderRestaurantCards,
    builder_activity_count: v2.counts.builderActivityCards,
    unique_pair_restaurant_count: v2.counts.uniquePairRestaurants,
    unique_pair_activity_count: v2.counts.uniquePairActivities,
    pair_count: promotedPairs.length,
    fallback_pair_count: 0,
    promoted_pair_count: promotedPairCount,
    fallbackPairsUsedAsPrimary: false,
    fallbackDiagnostics,
    matched_location_count: sameVenueResults.length,
    result_count: cards.length,
    rawActivityCandidateCount,
    rawRestaurantCandidateCount,
    pairCandidatesEvaluated,
    normalizedIntent,
    intentParserSource: "v2_planner",
    searchTelemetry,
    card_counts: {
      restaurants: restaurants.length,
      activities: activities.length,
      builder_restaurants: v2.counts.builderRestaurantCards,
      builder_activities: v2.counts.builderActivityCards,
      matched_locations: sameVenueResults.length,
      pairs: promotedPairs.length,
      cards: cards.length,
    },
    cardCounts: {
      restaurants: restaurants.length,
      activities: activities.length,
      builderRestaurants: v2.counts.builderRestaurantCards,
      builderActivities: v2.counts.builderActivityCards,
      matched_locations: sameVenueResults.length,
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
      intentParserSource: "v2_planner",
      normalizedIntent,
      requestedMode: v2.requestedMode,
      resolvedMode: v2.resolvedMode,
      displayMode: renderMode,
      primaryDomain: v2.primaryDomain,
      primary_domain: v2.primary_domain,
      primaryResultType: renderMode,
      terminalOutcome,
      no_pairs_reason: noPairsReason,
      canonicalCounts: {
        ...v2.counts,
        restaurantCards: restaurants.length,
        activityCards: activities.length,
        pairs: promotedPairs.length,
        displayedResults: cards.length,
      },
      rawActivityCandidateCount,
      rawRestaurantCandidateCount,
      pairCandidatesEvaluated,
      searchTelemetry,
      pairingDebug: v2.debug?.pairingDebug ?? null,
      candidateStages,
      activityCandidateRejections,
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
      restaurants,
      activities,
      sameVenueResults,
      pairs: promotedPairs,
      displayMode: renderMode,
      counts: {
        ...v2.counts,
        restaurantCards: restaurants.length,
        activityCards: activities.length,
        pairs: promotedPairs.length,
        displayedResults: cards.length,
      },
    },
  };
}
