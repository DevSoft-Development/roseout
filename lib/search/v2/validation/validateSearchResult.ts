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
    // Standalone candidate distance is distance from the search origin/anchor. It is
    // not the distance between the restaurant and activity and must never be used
    // to invalidate an already-built pair.
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

    // buildPairs validates venue-to-venue travel before diversification. Recheck
    // the pair-level values here as a final invariant without looking at each
    // venue's origin distance.
    result.pairs = result.pairs.filter((pair) => {
      const valid = validatePairDistance(plan, pair.distanceMiles, pair.walkingMinutes);
      if (!valid) rejected += 1;
      return valid;
    });

    if (rejected > 0) {
      trace?.decisions.push({
        stage: "distance_validation",
        decision: "hard_distance_results_removed",
        reason: JSON.stringify({
          rejected,
          maxDistanceMiles: plan.pairing.maxDistanceMiles,
          maxWalkingMinutes: plan.pairing.maxWalkingMinutes,
          maxDrivingMinutes: plan.pairing.maxDrivingMinutes,
          travelMode: plan.travel.mode,
          pairingRequired: plan.pairing.required,
        }),
      });
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
