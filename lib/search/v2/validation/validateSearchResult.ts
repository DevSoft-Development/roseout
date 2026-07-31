import { isEligibleForPublicEmbedding } from "../../enterprise/semantic";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ResolvedSearchResult } from "../fallback/fallbackTypes";
import type { SearchTrace } from "../observability/searchTrace";

export type ValidationResult = { valid: boolean; errors: string[]; result: ResolvedSearchResult };

function candidateDistance(candidate: ResolvedSearchResult["restaurants"][number]) {
  const retrievedCandidate = candidate.candidate.candidate;
  const locationDistance = retrievedCandidate.location?.distance_miles;
  const distance = retrievedCandidate.distanceMiles ?? locationDistance;
  return typeof distance === "number" && Number.isFinite(distance) ? distance : null;
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

  const hardDistance = plan.travel.constraint === "hard" && plan.pairing.maxDistanceMiles != null;
  let rejected = 0;
  if (hardDistance) {
    const withinLimit = (candidate: ResolvedSearchResult["restaurants"][number]) => {
      const distance = candidateDistance(candidate);
      const valid = distance != null && distance <= Number(plan.pairing.maxDistanceMiles);
      if (!valid) rejected += 1;
      return valid;
    };
    result.restaurants = result.restaurants.filter(withinLimit);
    result.activities = result.activities.filter(withinLimit);
    result.sameVenueResults = result.sameVenueResults.filter(withinLimit);
    result.pairs = result.pairs.filter((pair) => {
      const validRestaurant = withinLimit(pair.restaurant);
      const validActivity = withinLimit(pair.activity);
      return validRestaurant && validActivity;
    });
    if (rejected > 0) {
      trace?.decisions.push({ stage: "distance_validation", decision: "hard_distance_candidates_removed", reason: JSON.stringify({ rejected, maxDistanceMiles: plan.pairing.maxDistanceMiles, travelMode: plan.travel.mode }) });
    }
  }

  if (plan.pairing.sameVenueRequired && result.pairs.some((pair) => String(pair.restaurant.candidate.candidate.location.id) !== String(pair.activity.candidate.candidate.location.id))) errors.push("same_venue_required");
  if (result.requestFulfilled && plan.pairing.required && !result.pairs.length && !result.sameVenueResults.length) errors.push("missing_required_pair");

  const displayed = result.pairs.length || result.sameVenueResults.length || result.restaurants.length + result.activities.length;
  if (hardDistance && displayed === 0 && rejected > 0) {
    errors.push("ANCHOR_DISTANCE_VIOLATION");
    result.requestFulfilled = false;
    result.partialResults = result.retrievedCandidates > 0;
    result.used = true;
    result.reason = "no_pairs_within_distance";
  }
  if (errors.length) result.requestFulfilled = false;
  if (trace) trace.counts.displayed = displayed;
  return { valid: errors.length === 0, errors, result };
}
