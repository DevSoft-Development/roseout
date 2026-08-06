import { isEligibleForPublicEmbedding } from "../../enterprise/semantic";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ResolvedSearchResult } from "../fallback/fallbackTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { validatePairDistance } from "../pairing/validatePairDistance";

export type ValidationResult = { valid: boolean; errors: string[]; result: ResolvedSearchResult };

function candidateDistance(candidate: ResolvedSearchResult["restaurants"][number]) {
  const retrievedCandidate = candidate.candidate.candidate;
  const locationDistance = retrievedCandidate.location?.distance_miles;
  const distance = retrievedCandidate.distanceMiles ?? locationDistance;
  return typeof distance === "number" && Number.isFinite(distance) ? distance : null;
}

function recomputeFulfillment(plan: SearchPlan, result: ResolvedSearchResult) {
  const hasRestaurant = !plan.restaurant.required || result.restaurants.length > 0 || result.pairs.length > 0;
  const hasActivity = !plan.activity.required || result.activities.length > 0 || result.pairs.length > 0;
  const hasPair = result.pairs.length > 0;
  const hasSameVenue = result.sameVenueResults.length > 0;

  if (plan.mode === "restaurant_only") return hasRestaurant;
  if (plan.mode === "activity_only") return hasActivity;
  if (plan.mode === "same_venue") {
    return hasSameVenue || (!plan.pairing.sameVenueRequired && plan.fallback.allowNearbyPair && hasPair);
  }
  if (plan.mode === "paired_outing") return hasRestaurant && hasActivity && hasPair;
  return hasRestaurant;
}

export function validateSearchResult({ plan, result, trace }: { plan: SearchPlan; result: ResolvedSearchResult; trace?: SearchTrace }): ValidationResult {
  const errors: string[] = [];
  const eligible = (candidate: ResolvedSearchResult["restaurants"][number]) => {
    const location = candidate.candidate.candidate.location;
    return isEligibleForPublicEmbedding(location).eligible && !["closed", "archived", "hidden", "deleted"].includes(String(location.status ?? "").toLowerCase());
  };

  result.restaurants = result.restaurants.filter(eligible);
  result.activities = result.activities.filter(eligible);
  result.sameVenueResults = result.sameVenueResults.filter(eligible);
  result.pairs = result.pairs.filter((pair) => eligible(pair.restaurant) && eligible(pair.activity));

  const hardDistance = plan.travel.constraint === "hard"
    && (plan.pairing.maxDistanceMiles != null
      || plan.pairing.maxWalkingMinutes != null
      || plan.pairing.maxDrivingMinutes != null
      || plan.pairing.requireWalkable);
  let rejected = 0;
  if (hardDistance) {
    if (!plan.pairing.required) {
      const withinOriginLimit = (candidate: ResolvedSearchResult["restaurants"][number]) => {
        if (plan.pairing.maxDistanceMiles == null) return true;
        const distance = candidateDistance(candidate);
        const valid = distance != null && distance <= Number(plan.pairing.maxDistanceMiles);
        if (!valid) rejected += 1;
        return valid;
      };
      result.restaurants = result.restaurants.filter(withinOriginLimit);
      result.activities = result.activities.filter(withinOriginLimit);
      result.sameVenueResults = result.sameVenueResults.filter(withinOriginLimit);
    }

    result.pairs = result.pairs.filter((pair) => {
      const valid = validatePairDistance(plan, pair.distanceMiles, pair.walkingMinutes);
      if (!valid) rejected += 1;
      return valid;
    });
  }

  if (plan.pairing.sameVenueRequired && result.pairs.some((pair) => String(pair.restaurant.candidate.candidate.location.id) !== String(pair.activity.candidate.candidate.location.id))) {
    errors.push("same_venue_required");
  }

  result.requestFulfilled = recomputeFulfillment(plan, result);
  if (plan.pairing.required && !result.requestFulfilled && !result.pairs.length && !result.sameVenueResults.length) {
    errors.push("missing_required_pair");
  }

  const displayed = result.pairs.length + result.sameVenueResults.length + result.restaurants.length + result.activities.length;
  if (hardDistance && displayed === 0 && rejected > 0) {
    errors.push("ANCHOR_DISTANCE_VIOLATION");
    result.requestFulfilled = false;
    result.partialResults = result.retrievedCandidates > 0;
    result.used = true;
    result.reason = "no_pairs_within_distance";
  }

  if (!result.requestFulfilled && (result.restaurants.length > 0 || result.activities.length > 0)) {
    result.partialResults = true;
  }

  trace?.decisions.push({
    stage: "final_fulfillment_contract",
    decision: result.requestFulfilled ? "fulfilled" : "not_fulfilled",
    reason: JSON.stringify({
      restaurants: result.restaurants.length,
      activities: result.activities.length,
      sameVenueResults: result.sameVenueResults.length,
      pairs: result.pairs.length,
      errors,
    }),
  });
  if (trace) trace.counts.displayed = displayed;
  return { valid: errors.length === 0, errors, result };
}
