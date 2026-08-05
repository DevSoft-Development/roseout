import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ResolvedSearchResult } from "../fallback/fallbackTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { PublicLocationCard, PublicSearchOutcome, PublicSearchResponseV2 } from "./responseTypes";
import { resultCounts } from "./resultCounts";
import { sanitizePublicLocation } from "./sanitizePublicLocation";

function effectiveRetrievalGeoLevel(item: ResolvedSearchResult["restaurants"][number]) {
  const geoMatch = item.candidate.candidate.geoMatch;
  if (geoMatch?.tier === "exact_locality") {
    return geoMatch.scopeLevel === "neighborhood" ? "exact_neighborhood" : geoMatch.scopeLevel ?? "exact_locality";
  }
  if (geoMatch?.tier === "nearby_radius") return "nearby_radius";
  if (geoMatch?.tier === "broader_fallback") return `broader_${geoMatch.scopeLevel ?? "fallback"}`;
  return "outside_scope";
}

const card = (item: ResolvedSearchResult["restaurants"][number]): PublicLocationCard => {
  const whyMatched = item.reasons.filter((reason) => !/deterministic ranking|bounded ML ranking boost applied/i.test(reason)).join("; ");
  return sanitizePublicLocation({ ...item.candidate.candidate.location, retrieval_geo_level: effectiveRetrievalGeoLevel(item), searchRole: item.selectedRole, searchScore: item.scores.total, matchReasons: item.reasons, whyMatched, why_it_matched: whyMatched });
};

function primaryDomain(plan: SearchPlan): PublicSearchResponseV2["primaryDomain"] {
  if (plan.mode === "anchored_nearby") return "anchor";
  if (plan.restaurant.required && plan.activity.required) return "mixed";
  if (plan.activity.required) return "activity";
  return "restaurant";
}

function normalizeName(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function anchorCandidateCounts(plan: SearchPlan, trace: SearchTrace) {
  const target = normalizeName(plan.anchor.rawName);
  if (!target) return { exact: 0, fuzzy: trace.anchorResolution.candidates.length };
  let exact = 0;
  let fuzzy = 0;
  for (const candidate of trace.anchorResolution.candidates) {
    if (normalizeName(candidate.name) === target) exact += 1;
    else fuzzy += 1;
  }
  return { exact, fuzzy };
}

function hasConstraintRejectionEvidence(plan: SearchPlan, trace: SearchTrace) {
  if (plan.travel.constraint !== "hard" || !trace.pairingDebug) return false;
  const rejections = trace.pairingDebug.rejectionCounts;
  return (rejections.walkability_constraint ?? 0) > 0 || (rejections.distance_exceeded ?? 0) > 0 || trace.pairingDebug.allCandidatePairsExceededTravelLimit;
}

function determineOutcome(plan: SearchPlan, trace: SearchTrace, pairCount: number): PublicSearchOutcome | undefined {
  const anchorStatus = trace.anchorResolution.status;
  const candidateCounts = anchorCandidateCounts(plan, trace);

  if (plan.anchor.generic) {
    return anchorStatus === "resolved" ? undefined : "clarification_required";
  }

  if (plan.anchor.exactNameRequired) {
    if (candidateCounts.exact > 1) return "clarification_required";
    if (candidateCounts.exact === 0) return "anchor_not_found";
  }

  if (anchorStatus === "clarification_required") return "clarification_required";
  if (anchorStatus === "not_found" || anchorStatus === "missing_coordinates") return "anchor_not_found";
  if (plan.pairing.required && pairCount === 0 && hasConstraintRejectionEvidence(plan, trace)) return "expected_constraint_no_pair";
  return undefined;
}

function responseMessage(result: ResolvedSearchResult, outcome?: PublicSearchOutcome) {
  if (outcome === "clarification_required") return "Choose the specific place you mean before nearby results are searched.";
  if (outcome === "anchor_not_found") return "The exact named place could not be resolved, so nearby results were not guessed.";
  if (outcome === "expected_constraint_no_pair") return "Candidates were found, but no pair satisfied the requested travel constraint.";
  if (result.requestFulfilled && result.geoResolution?.servedTier === "nearby_radius") return "No complete match was available directly in the requested locality, so nearby options are shown.";
  if (result.requestFulfilled && result.geoResolution?.servedTier === "broader_fallback") return "No complete local match was available, so clearly labeled broader-area options are shown.";
  if (result.requestFulfilled) return "We found options matching your outing.";
  if (result.partialResults) return "We found partial matches and clearly labeled them.";
  return "No valid matches were found within your constraints.";
}

export function buildPublicSearchResponse({ plan, result, trace }: { plan: SearchPlan; result: ResolvedSearchResult; trace: SearchTrace }): PublicSearchResponseV2 {
  const restaurants = result.restaurants.map(card);
  const activities = result.activities.map(card);
  const sameVenueResults = result.sameVenueResults.map(card);
  const pairs = result.pairs.map((pair) => {
    const pairReasons = [
      ...pair.restaurant.reasons.filter((reason) => /matched|qualified|casual|relaxed|dinner/i.test(reason)),
      ...pair.activity.reasons.filter((reason) => /matched|qualified|casual|relaxed/i.test(reason)),
      ...pair.reasons,
    ];
    const whyMatched = pairReasons.join("; ");
    return {
      restaurant: card(pair.restaurant),
      activity: card(pair.activity),
      distanceMiles: pair.distanceMiles,
      walkingMinutes: pair.walkingMinutes,
      score: pair.scores.total,
      geoTier: pair.geoTier,
      isFallbackPair: pair.isFallbackPair,
      matchReasons: pairReasons,
      whyMatched,
      why_it_matched: whyMatched,
    };
  });

  if (trace.pairingDebug) {
    trace.pairingDebug.renderEligiblePairCount = pairs.length;
    trace.pairingDebug.finalEligiblePairs = pairs.map((pair) => ({
      restaurantId: String(pair.restaurant.id),
      activityId: String(pair.activity.id),
      distanceMiles: pair.distanceMiles,
      walkingMinutes: pair.walkingMinutes,
      geoTier: pair.geoTier ?? "exact_locality",
    }));
    trace.pairingDebug.eligibilityContractValid = trace.pairingDebug.renderEligiblePairCount === trace.pairingDebug.finalEligiblePairs.length;
    trace.pairingDebug.eligibilityContractViolation = trace.pairingDebug.eligibilityContractValid
      ? null
      : `renderEligiblePairCount=${trace.pairingDebug.renderEligiblePairCount};finalEligiblePairs=${trace.pairingDebug.finalEligiblePairs.length}`;
    trace.counts.pairsValid = pairs.length;
    trace.decisions.push({
      stage: "render_pairing_contract",
      decision: trace.pairingDebug.eligibilityContractValid ? "render_eligibility_finalized" : "pairing_contract_violation",
      reason: JSON.stringify({
        renderEligiblePairCount: trace.pairingDebug.renderEligiblePairCount,
        finalEligiblePairs: trace.pairingDebug.finalEligiblePairs,
        validPairCountAfterConstraints: trace.pairingDebug.validPairCountAfterConstraints,
        validPairCountAfterDiversification: trace.pairingDebug.validPairCountAfterDiversification,
      }),
    });
  }

  const builderRestaurants = result.builderRestaurants.map(card);
  const builderActivities = result.builderActivities.map(card);
  const outcome = determineOutcome(plan, trace, pairs.length);
  const unresolvedAnchor = outcome === "clarification_required" || outcome === "anchor_not_found";
  const effectiveAnchorResolution = outcome === "clarification_required"
    ? { ...trace.anchorResolution, status: "clarification_required" as const, requiresClarification: true }
    : outcome === "anchor_not_found"
      ? { ...trace.anchorResolution, status: "not_found" as const, requiresClarification: false }
      : trace.anchorResolution;
  const displayMode = unresolvedAnchor ? "empty" : pairs.length ? "pairs" : sameVenueResults.length ? "same_venue_cards" : result.partialResults ? "partial_mixed" : restaurants.length ? "restaurant_cards" : activities.length ? "activity_cards" : "empty";
  const domain = primaryDomain(plan);
  const mixedPairRequired = plan.restaurant.required && plan.activity.required && plan.mode !== "same_venue";
  const success = !unresolvedAnchor && (result.requestFulfilled || (result.partialResults && !mixedPairRequired));
  const applied = Boolean(trace.ml.enabled && (trace.ml.phase1Enabled || trace.ml.phase2Enabled));
  const configuredVariant = trace.ml.rankingVariant;
  const appliedVariant = applied ? configuredVariant ?? "ml" : "control";
  const anchorLocation = plan.anchor.requested && plan.anchor.name && plan.anchor.locationId ? sanitizePublicLocation({ id: plan.anchor.locationId, name: plan.anchor.name, activity_name: plan.anchor.name, location_type: "anchor", primary_category: "anchor", city: plan.geo.city, borough: plan.geo.borough, state: plan.geo.state, latitude: plan.anchor.latitude, longitude: plan.anchor.longitude } as PublicLocationCard) : null;
  const rawCounts = resultCounts(result);
  const counts = unresolvedAnchor ? {
    ...rawCounts,
    restaurantCandidates: 0,
    activityCandidates: 0,
    dualRoleCandidates: 0,
    restaurantCards: 0,
    activityCards: 0,
    builderRestaurantCards: 0,
    builderActivityCards: 0,
    uniquePairRestaurants: 0,
    uniquePairActivities: 0,
    sameVenueCards: 0,
    pairs: 0,
    displayedResults: 0,
  } : rawCounts;
  const broaderGeoUsed = result.geoResolution?.servedTier === "nearby_radius" || result.geoResolution?.servedTier === "broader_fallback";
  const deterministicFallbackUsed = Boolean(result.used && !broaderGeoUsed);
  const candidateCounts = anchorCandidateCounts(plan, trace);
  const inventoryAudit = {
    status: plan.restaurant.required && builderRestaurants.length === 0 || plan.activity.required && builderActivities.length === 0 ? "inconclusive" : "satisfied",
    requestedRestaurant: plan.restaurant.required,
    requestedActivity: plan.activity.required,
    restaurantBuilderCandidates: builderRestaurants.length,
    activityBuilderCandidates: builderActivities.length,
    restaurantTerms: [...plan.restaurant.cuisines, ...plan.restaurant.foods, ...plan.restaurant.features],
    activityTerms: [...plan.activity.categories, ...plan.activity.features],
    geo: { city: plan.geo.city, borough: plan.geo.borough, county: plan.geo.county, radiusMiles: plan.geo.radiusMiles },
    fallbackUsed: deterministicFallbackUsed,
    pairingFailure: trace.pairingDebug?.primaryFailure ?? null,
  };

  return {
    version: "public-search-v2",
    success,
    requestFulfilled: unresolvedAnchor ? false : result.requestFulfilled,
    partialResults: unresolvedAnchor ? false : result.partialResults,
    requestId: plan.requestId,
    requestedMode: plan.mode,
    resolvedMode: result.resolvedMode,
    primaryDomain: domain,
    primary_domain: domain,
    displayMode,
    searchPlan: plan,
    restaurants: unresolvedAnchor ? [] : restaurants,
    activities: unresolvedAnchor ? [] : activities,
    sameVenueResults: unresolvedAnchor ? [] : sameVenueResults,
    pairs: unresolvedAnchor ? [] : pairs,
    builder: { enabled: !unresolvedAnchor && Boolean(builderRestaurants.length && builderActivities.length), restaurants: unresolvedAnchor ? [] : builderRestaurants, activities: unresolvedAnchor ? [] : builderActivities, selectedRestaurantId: null, selectedActivityId: null },
    anchor: { requested: plan.anchor.requested, resolved: Boolean(plan.anchor.locationId && plan.anchor.latitude != null && plan.anchor.longitude != null), rawName: plan.anchor.rawName, relationship: plan.anchor.requested ? "near" : null, location: anchorLocation },
    anchorResolution: effectiveAnchorResolution,
    outcome,
    geoResolution: result.geoResolution,
    counts,
    fallback: { used: unresolvedAnchor ? false : deterministicFallbackUsed, reason: unresolvedAnchor || broaderGeoUsed ? null : result.reason },
    retrieval: { ...trace.retrieval },
    message: responseMessage(result, outcome),
    timing: trace.timing,
    ml: { enabled: trace.ml.enabled, modelVersion: trace.ml.modelVersion, rankingVariant: appliedVariant, configuredVariant, appliedVariant, applied, shadowOnly: trace.ml.enabled && !applied, rolloutBucket: trace.ml.rolloutBucket, reason: applied ? "ML ranking affected the served order." : trace.ml.enabled ? "ML was configured but did not affect the served order." : "ML ranking was disabled." },
    debug: {
      recovery: {
        deterministicFallbackUsed,
        broaderGeoUsed,
        broaderGeoTier: broaderGeoUsed ? result.geoResolution?.servedTier ?? null : null,
        fallbackReason: deterministicFallbackUsed ? result.reason : null,
      },
      anchorPolicy: {
        entityType: plan.anchor.entityType ?? "none",
        generic: plan.anchor.generic ?? false,
        exactNameRequired: plan.anchor.exactNameRequired ?? false,
        exactCandidateCount: candidateCounts.exact,
        fuzzyCandidateCount: candidateCounts.fuzzy,
        terminalOutcome: outcome ?? null,
      },
      inventoryAudit,
      pairingDiagnostics: trace.pairingDebug ? {
        primaryFailure: trace.pairingDebug.primaryFailure,
        nearestRejectedPair: trace.pairingDebug.nearestRejectedPair,
        allCandidatePairsExceededTravelLimit: trace.pairingDebug.allCandidatePairsExceededTravelLimit,
      } : null,
    },
  };
}
