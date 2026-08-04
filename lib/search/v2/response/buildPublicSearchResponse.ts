import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ResolvedSearchResult } from "../fallback/fallbackTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { PublicLocationCard, PublicSearchOutcome, PublicSearchResponseV2 } from "./responseTypes";
import { resultCounts } from "./resultCounts";
import { sanitizePublicLocation } from "./sanitizePublicLocation";

const card = (item: ResolvedSearchResult["restaurants"][number]): PublicLocationCard => {
  const whyMatched = item.reasons.filter((reason) => !/deterministic ranking|bounded ML ranking boost applied/i.test(reason)).join("; ");
  return sanitizePublicLocation({ ...item.candidate.candidate.location, searchRole: item.selectedRole, searchScore: item.scores.total, matchReasons: item.reasons, whyMatched, why_it_matched: whyMatched });
};

function primaryDomain(plan: SearchPlan): PublicSearchResponseV2["primaryDomain"] {
  if (plan.mode === "anchored_nearby") return "anchor";
  if (plan.restaurant.required && plan.activity.required) return "mixed";
  if (plan.activity.required) return "activity";
  return "restaurant";
}

function hasConstraintRejectionEvidence(plan: SearchPlan, trace: SearchTrace) {
  if (plan.travel.constraint !== "hard" || !trace.pairingDebug) return false;
  const rejections = trace.pairingDebug.rejectionCounts;
  return (rejections.walkability_constraint ?? 0) > 0 || (rejections.distance_exceeded ?? 0) > 0;
}

function determineOutcome(plan: SearchPlan, result: ResolvedSearchResult, trace: SearchTrace, pairCount: number): PublicSearchOutcome | undefined {
  if (trace.anchorResolution.status === "clarification_required") return "clarification_required";
  if (trace.anchorResolution.status === "not_found" || trace.anchorResolution.status === "missing_coordinates") return "anchor_not_found";
  if (plan.pairing.required && pairCount === 0 && hasConstraintRejectionEvidence(plan, trace)) return "expected_constraint_no_pair";
  return undefined;
}

function responseMessage(result: ResolvedSearchResult, outcome?: PublicSearchOutcome) {
  if (outcome === "clarification_required") return "Choose the specific place you mean before nearby results are searched.";
  if (outcome === "anchor_not_found") return "The named place could not be resolved, so nearby results were not guessed.";
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
  const builderRestaurants = result.builderRestaurants.map(card);
  const builderActivities = result.builderActivities.map(card);
  const outcome = determineOutcome(plan, result, trace, pairs.length);
  const unresolvedAnchor = outcome === "clarification_required" || outcome === "anchor_not_found";
  const displayMode = unresolvedAnchor ? "empty" : pairs.length ? "pairs" : sameVenueResults.length ? "same_venue_cards" : result.partialResults ? "partial_mixed" : restaurants.length ? "restaurant_cards" : activities.length ? "activity_cards" : "empty";
  const domain = primaryDomain(plan);
  const mixedPairRequired = plan.restaurant.required && plan.activity.required && plan.mode !== "same_venue";
  const success = !unresolvedAnchor && (result.requestFulfilled || (result.partialResults && !mixedPairRequired));
  const applied = Boolean(trace.ml.enabled && (trace.ml.phase1Enabled || trace.ml.phase2Enabled));
  const configuredVariant = trace.ml.rankingVariant;
  const appliedVariant = applied ? configuredVariant ?? "ml" : "control";
  const anchorLocation = plan.anchor.requested && plan.anchor.name && plan.anchor.locationId ? sanitizePublicLocation({ id: plan.anchor.locationId, name: plan.anchor.name, activity_name: plan.anchor.name, location_type: "anchor", primary_category: "anchor", city: plan.geo.city, borough: plan.geo.borough, state: plan.geo.state, latitude: plan.anchor.latitude, longitude: plan.anchor.longitude } as PublicLocationCard) : null;

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
    anchorResolution: trace.anchorResolution,
    outcome,
    geoResolution: result.geoResolution,
    counts: unresolvedAnchor ? { ...resultCounts(result), restaurants: 0, activities: 0, sameVenueResults: 0, pairs: 0, total: 0 } : resultCounts(result),
    fallback: { used: unresolvedAnchor ? false : result.used, reason: unresolvedAnchor ? null : result.reason },
    retrieval: { ...trace.retrieval },
    message: responseMessage(result, outcome),
    timing: trace.timing,
    ml: { enabled: trace.ml.enabled, modelVersion: trace.ml.modelVersion, rankingVariant: appliedVariant, configuredVariant, appliedVariant, applied, shadowOnly: trace.ml.enabled && !applied, rolloutBucket: trace.ml.rolloutBucket, reason: applied ? "ML ranking affected the served order." : trace.ml.enabled ? "ML was configured but did not affect the served order." : "ML ranking was disabled." },
  };
}
