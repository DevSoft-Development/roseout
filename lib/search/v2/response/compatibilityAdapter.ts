import type { PublicSearchResponseV2 } from "./responseTypes";

function withoutStandaloneDistance<T extends Record<string, any>>(item: T): T {
  return { ...item, distance_miles: null };
}

function roundedPairDistance(value: unknown) {
  const distance = Number(value);
  return Number.isFinite(distance) ? Math.round(distance * 100) / 100 : null;
}

export function adaptV2ResponseToCurrentPublicContract(v2: PublicSearchResponseV2) {
  const publicRestaurants = v2.restaurants.map((restaurant) => withoutStandaloneDistance(restaurant as any));
  const publicActivities = v2.activities.map((activity) => withoutStandaloneDistance(activity as any));
  const promotedPairs = v2.pairs.map((pair) => {
    const normalized = pair.isFallbackPair ? { ...pair, isFallbackPair: false } : { ...pair };
    return {
      ...normalized,
      pair_distance_miles: roundedPairDistance(pair.distanceMiles),
    };
  });
  const mixedPairRequired = Boolean(v2.searchPlan.pairing.required);
  const expectedConstraintNoPair = v2.outcome === "expected_constraint_no_pair";
  const noCompatiblePair =
    mixedPairRequired &&
    promotedPairs.length === 0 &&
    !expectedConstraintNoPair &&
    (publicRestaurants.length > 0 || publicActivities.length > 0);
  const truthfulRequestFulfilled = noCompatiblePair
    ? false
    : v2.requestFulfilled;
  const truthfulPartialResults = noCompatiblePair
    ? true
    : v2.partialResults;
  const terminalOutcome = expectedConstraintNoPair
    ? "expected_constraint_no_pair"
    : noCompatiblePair
      ? "no_compatible_pair"
      : v2.outcome;
  const noPairsReason =
    mixedPairRequired && promotedPairs.length === 0
      ? v2.debug?.pairingDebug?.primaryFailure ?? (expectedConstraintNoPair ? "expected_constraint_no_pair" : "no_compatible_pair")
      : null;
  const cards = [
    ...promotedPairs,
    ...v2.sameVenueResults,
    ...publicRestaurants,
    ...publicActivities,
  ];
  const hasMixedSections =
    promotedPairs.length > 0 &&
    (publicRestaurants.length > 0 || publicActivities.length > 0);
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
    (expectedConstraintNoPair ? "expected_constraint_no_pair" : null) ??
    (noCompatiblePair ? "no_compatible_pair" : null) ??
    (v2.retrieval.legacyFallbackUsed ? "canonical_profile_lane_empty" : null);
  const fallbackDiagnostics = {
    used: Boolean(
      v2.fallback.used ||
        v2.retrieval.legacyFallbackUsed ||
        promotedPairCount ||
        noCompatiblePair ||
        expectedConstraintNoPair,
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
  const nlp = (v2.debug as any)?.nlp ?? null;
  const learnedLanguage = (v2.debug as any)?.learnedLanguage ?? null;
  const conversationRefinement = (v2.debug as any)?.conversationRefinement ?? null;
  const phase13ProductionIntegration = (v2.debug as any)?.phase13ProductionIntegration ?? null;
  const failureCategory = (v2.debug as any)?.failureCategory ?? null;
  const parserSource = learnedLanguage?.used
    ? "v2_learned_mapping"
    : nlp?.llmUsed
      ? "v2_hybrid_llm"
      : "v2_planner";
  const stageTimings = { ...v2.timing };
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
    ],
    activityFeatures: [
      ...(v2.searchPlan.activity.features ?? []),
    ],
    restaurantExclusions: [...(v2.searchPlan.restaurant.exclusions ?? [])],
    activityExclusions: [...(v2.searchPlan.activity.exclusions ?? [])],
    relationship: v2.searchPlan.relationship ?? nlp?.relationship ?? null,
    preferences: v2.searchPlan.preferences ?? null,
    language: nlp
      ? {
          relationship: nlp.relationship ?? null,
          negatives: nlp.negatives ?? null,
          preferences: nlp.preferences ?? null,
          ambiguityReasons: Array.isArray(nlp.ambiguityReasons) ? nlp.ambiguityReasons : [],
          llmUsed: nlp.llmUsed === true,
          llmModel: nlp.llmModel ?? null,
          llmConfidence: nlp.llmConfidence ?? null,
          llmRelationship: nlp.llmRelationship ?? null,
          llmRewriteApplied: nlp.llmRewriteApplied === true,
        }
      : null,
    learnedLanguage,
    conversationRefinement,
    semantic: phase13ProductionIntegration
      ? {
          status: phase13ProductionIntegration.status ?? null,
          semanticEnabled: phase13ProductionIntegration.semanticEnabled === true,
          hybridApply: phase13ProductionIntegration.hybridApply === true,
          rankingVariant: phase13ProductionIntegration.rankingVariant ?? null,
          restaurant: phase13ProductionIntegration.restaurant ?? null,
          activity: phase13ProductionIntegration.activity ?? null,
        }
      : null,
    stageTimings,
    failureCategory,
    intentParserSource: parserSource,
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
    stageTimings,
  };

  return {
    success: noCompatiblePair ? false : v2.success,
    reply: noCompatiblePair
      ? "We found restaurant and activity options, but no compatible pair satisfied the final pairing rules."
      : v2.message,
    restaurants: publicRestaurants,
    activities: publicActivities,
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
    no_pairs_reason: noPairsReason,
    primary_domain: v2.primary_domain,
    primaryDomain: v2.primaryDomain,
    primaryResultType: renderMode,
    restaurant_count: publicRestaurants.length,
    activity_count: publicActivities.length,
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
    normalizedIntent,
    intentParserSource: parserSource,
    searchTelemetry,
    card_counts: {
      restaurants: publicRestaurants.length,
      activities: publicActivities.length,
      builder_restaurants: v2.counts.builderRestaurantCards,
      builder_activities: v2.counts.builderActivityCards,
      matched_locations: v2.sameVenueResults.length,
      pairs: promotedPairs.length,
      cards: cards.length,
    },
    cardCounts: {
      restaurants: publicRestaurants.length,
      activities: publicActivities.length,
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
      intentParserSource: parserSource,
      normalizedIntent,
      searchPlan: v2.searchPlan,
      nlp,
      learnedLanguage,
      conversationRefinement,
      phase13ProductionIntegration,
      failureCategory,
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
        restaurantCards: publicRestaurants.length,
        activityCards: publicActivities.length,
        pairs: promotedPairs.length,
        displayedResults: cards.length,
      },
      performance: {
        taxonomy_ms: stageTimings.taxonomyMs ?? null,
        intent_parse_ms: stageTimings.intentParsingMs ?? stageTimings.plannerMs ?? null,
        planner_ms: stageTimings.plannerMs ?? null,
        restaurant_retrieval_ms: stageTimings.restaurantRetrievalMs ?? null,
        activity_retrieval_ms: stageTimings.activityRetrievalMs ?? null,
        retrieval_ms: stageTimings.retrievalMs ?? null,
        role_assignment_ms: stageTimings.roleAssignmentMs ?? null,
        ranking_ms: stageTimings.rankingMs ?? null,
        scoring_ms: stageTimings.scoringMs ?? null,
        pairing_ms: stageTimings.pairingMs ?? null,
        fallback_ms: stageTimings.fallbackMs ?? null,
        validation_ms: stageTimings.validationMs ?? null,
        serialization_ms: stageTimings.serializationMs ?? null,
        v2_total_ms: stageTimings.totalMs ?? null,
        stageTimings,
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
      restaurants: publicRestaurants,
      activities: publicActivities,
      pairs: promotedPairs,
      displayMode: renderMode,
      counts: {
        ...v2.counts,
        restaurantCards: publicRestaurants.length,
        activityCards: publicActivities.length,
        pairs: promotedPairs.length,
        displayedResults: cards.length,
      },
    },
  };
}
