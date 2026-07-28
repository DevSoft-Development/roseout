import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ScoredCandidate } from "../scoring/scoringTypes";
import type { SearchPair } from "../pairing/pairingTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type {
  FallbackReason,
  ResolvedSearchResult,
} from "./fallbackTypes";

export async function resolveFallback({
  plan,
  scored,
  pairs,
  retrievedCount,
  trace,
}: {
  plan: SearchPlan;
  scored: {
    restaurants: ScoredCandidate[];
    activities: ScoredCandidate[];
  };
  pairs: SearchPair[];
  retrievedCount: number;
  trace: SearchTrace;
}): Promise<ResolvedSearchResult> {
  const dual = scored.restaurants.filter((restaurant) =>
    scored.activities.some(
      (activity) =>
        String(activity.candidate.candidate.location.id) ===
        String(restaurant.candidate.candidate.location.id),
    ),
  );

  let fulfilled =
    plan.mode === "restaurant_only"
      ? scored.restaurants.length > 0
      : plan.mode === "activity_only"
        ? scored.activities.length > 0
        : plan.mode === "same_venue"
          ? dual.length > 0 ||
            (plan.fallback.allowNearbyPair && pairs.length > 0)
          : plan.mode === "paired_outing"
            ? pairs.length > 0
            : scored.restaurants.length > 0;

  let reason: FallbackReason | null = null;
  if (!fulfilled) {
    reason =
      scored.restaurants.length > 0 && scored.activities.length === 0
        ? "partial_restaurants_only"
        : scored.activities.length > 0 && scored.restaurants.length === 0
          ? "partial_activities_only"
          : plan.pairing.required
            ? "no_pairs_within_distance"
            : "no_valid_results";
  } else if (plan.mode === "same_venue" && !dual.length && pairs.length) {
    reason = "no_strong_same_venue_match";
  }

  const hasStandaloneCandidates =
    scored.restaurants.length > 0 || scored.activities.length > 0;
  const partial =
    !fulfilled && hasStandaloneCandidates && plan.fallback.allowPartial;
  const used = reason != null;

  trace.fallback = { used, reason };

  // When a pair fully satisfies the request, keep the public response pair-first.
  // When pairing fails but partial fallback is allowed, preserve the qualified
  // standalone candidates instead of returning a contradictory empty response.
  const showStandaloneCandidates = !plan.pairing.required || partial;

  return {
    requestedMode: plan.mode,
    resolvedMode: plan.mode,
    used,
    reason,
    requestFulfilled: fulfilled,
    partialResults: partial,
    restaurants: showStandaloneCandidates
      ? scored.restaurants.slice(0, 20)
      : [],
    activities: showStandaloneCandidates
      ? scored.activities.slice(0, 20)
      : [],
    sameVenueResults: dual.slice(0, 20),
    pairs: pairs.slice(0, 20),
    retrievedCandidates: retrievedCount,
  };
}
