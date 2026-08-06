import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ScoredCandidate } from "../scoring/scoringTypes";
import type { SearchPair } from "../pairing/pairingTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { FallbackReason, GeoResolution, ResolvedSearchResult } from "./fallbackTypes";

function diversify(items: ScoredCandidate[], limit = 8) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = String(item.candidate.candidate.location.id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, limit);
}

function pairingFailure(trace: SearchTrace): string | null {
  const entry = [...trace.decisions].reverse().find((decision) => decision.stage === "pairing_eligibility");
  if (!entry?.reason) return null;
  try {
    const parsed = JSON.parse(entry.reason) as { primaryFailure?: string | null };
    return parsed.primaryFailure ?? null;
  } catch {
    return null;
  }
}

export function buildGeoResolution(
  scored: { restaurants: ScoredCandidate[]; activities: ScoredCandidate[] },
  pairs: SearchPair[],
): GeoResolution {
  const all = [...scored.restaurants, ...scored.activities];
  const count = (tier: string) => all.filter((candidate) => candidate.candidate.candidate.geoMatch?.tier === tier).length;
  const servedTier = pairs[0]?.geoTier ?? null;
  return {
    servedTier,
    exactCandidateCount: count("exact_locality"),
    nearbyCandidateCount: count("nearby_radius"),
    broaderCandidateCount: count("broader_fallback"),
    fallbackUsed: servedTier === "nearby_radius" || servedTier === "broader_fallback",
    nearbyFallbackUsed: servedTier === "nearby_radius",
    broaderFallbackUsed: servedTier === "broader_fallback",
  };
}

export async function resolveFallback({ plan, scored, pairs, retrievedCount, trace }: {
  plan: SearchPlan;
  scored: { restaurants: ScoredCandidate[]; activities: ScoredCandidate[] };
  pairs: SearchPair[];
  retrievedCount: number;
  trace: SearchTrace;
}): Promise<ResolvedSearchResult> {
  const restaurants = scored.restaurants.slice(0, 20);
  const activities = scored.activities.slice(0, 20);
  const dual = restaurants.filter((restaurant) => activities.some((activity) => String(activity.candidate.candidate.location.id) === String(restaurant.candidate.candidate.location.id)));
  const hasRestaurant = !plan.restaurant.required || restaurants.length > 0;
  const hasActivity = !plan.activity.required || activities.length > 0;
  const hasPair = pairs.length > 0;
  const hasSameVenue = dual.length > 0;

  const fulfilled = plan.mode === "restaurant_only"
    ? hasRestaurant
    : plan.mode === "activity_only"
      ? hasActivity
      : plan.mode === "same_venue"
        ? hasSameVenue || (!plan.pairing.sameVenueRequired && plan.fallback.allowNearbyPair && hasPair)
        : plan.mode === "paired_outing"
          ? hasRestaurant && hasActivity && hasPair
          : hasRestaurant;

  const geo = buildGeoResolution(scored, pairs);
  let reason: FallbackReason | null = null;
  if (!fulfilled) {
    const primaryPairingFailure = pairingFailure(trace);
    reason = retrievedCount === 0
      ? "no_candidates_retrieved"
      : restaurants.length > 0 && activities.length === 0
        ? "partial_restaurants_only"
        : activities.length > 0 && restaurants.length === 0
          ? "partial_activities_only"
          : plan.pairing.required
            ? primaryPairingFailure === "market_mismatch" || primaryPairingFailure === "geography_rejection"
              ? "no_pairs_within_geography"
              : "no_pairs_within_distance"
            : "no_valid_results";
  } else if (geo.nearbyFallbackUsed) {
    reason = "nearby_geo_used";
  } else if (geo.broaderFallbackUsed) {
    reason = "broader_geo_used";
  } else if (plan.mode === "same_venue" && !hasSameVenue && hasPair) {
    reason = "no_strong_same_venue_match";
  }

  const partial = !fulfilled && (restaurants.length > 0 || activities.length > 0) && plan.fallback.allowPartial;
  const used = reason != null;
  trace.fallback = { used, reason };
  trace.decisions.push({
    stage: "result_preservation_contract",
    decision: "domain_lanes_preserved",
    reason: JSON.stringify({
      restaurantCount: restaurants.length,
      activityCount: activities.length,
      pairCount: pairs.length,
      fulfilled,
    }),
  });
  trace.decisions.push({ stage: "geo_resolution", decision: "served_geo_tier_resolved", reason: JSON.stringify(geo) });

  return {
    requestedMode: plan.mode,
    resolvedMode: plan.mode,
    used,
    reason,
    requestFulfilled: fulfilled,
    partialResults: partial,
    restaurants,
    activities,
    builderRestaurants: plan.restaurant.required && plan.activity.required ? diversify(restaurants, 8) : [],
    builderActivities: plan.restaurant.required && plan.activity.required ? diversify(activities, 8) : [],
    sameVenueResults: dual.slice(0, 20),
    pairs: pairs.slice(0, 20),
    retrievedCandidates: retrievedCount,
    geoResolution: geo,
  };
}
