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

function geoResolution(scored: { restaurants: ScoredCandidate[]; activities: ScoredCandidate[] }, pairs: SearchPair[]): GeoResolution {
  const all = [...scored.restaurants, ...scored.activities];
  const count = (tier: string) => all.filter((candidate) => candidate.candidate.candidate.geoMatch?.tier === tier).length;
  const servedTier = pairs[0]?.geoTier ?? null;
  return {
    servedTier,
    exactCandidateCount: count("exact_locality"),
    nearbyCandidateCount: count("nearby_radius"),
    broaderCandidateCount: count("broader_fallback"),
    broaderFallbackUsed: servedTier != null && servedTier !== "exact_locality",
  };
}

export async function resolveFallback({ plan, scored, pairs, retrievedCount, trace }: {
  plan: SearchPlan;
  scored: { restaurants: ScoredCandidate[]; activities: ScoredCandidate[] };
  pairs: SearchPair[];
  retrievedCount: number;
  trace: SearchTrace;
}): Promise<ResolvedSearchResult> {
  const dual = scored.restaurants.filter((restaurant) => scored.activities.some((activity) => String(activity.candidate.candidate.location.id) === String(restaurant.candidate.candidate.location.id)));
  const fulfilled = plan.mode === "restaurant_only"
    ? scored.restaurants.length > 0
    : plan.mode === "activity_only"
      ? scored.activities.length > 0
      : plan.mode === "same_venue"
        ? dual.length > 0 || (plan.fallback.allowNearbyPair && pairs.length > 0)
        : plan.mode === "paired_outing"
          ? pairs.length > 0
          : scored.restaurants.length > 0;

  const geo = geoResolution(scored, pairs);
  let reason: FallbackReason | null = null;
  if (!fulfilled) {
    const primaryPairingFailure = pairingFailure(trace);
    reason = retrievedCount === 0
      ? "no_candidates_retrieved"
      : scored.restaurants.length > 0 && scored.activities.length === 0
        ? "partial_restaurants_only"
        : scored.activities.length > 0 && scored.restaurants.length === 0
          ? "partial_activities_only"
          : plan.pairing.required
            ? primaryPairingFailure === "market_mismatch" || primaryPairingFailure === "geography_rejection"
              ? "no_pairs_within_geography"
              : "no_pairs_within_distance"
            : "no_valid_results";
  } else if (geo.broaderFallbackUsed) {
    reason = "broader_geo_used";
  } else if (plan.mode === "same_venue" && !dual.length && pairs.length) {
    reason = "no_strong_same_venue_match";
  }

  const hasStandaloneCandidates = scored.restaurants.length > 0 || scored.activities.length > 0;
  const partial = !fulfilled && hasStandaloneCandidates && plan.fallback.allowPartial;
  const used = reason != null;
  trace.fallback = { used, reason };
  trace.decisions.push({ stage: "geo_resolution", decision: "served_geo_tier_resolved", reason: JSON.stringify(geo) });
  const showStandaloneCandidates = !plan.pairing.required || partial;

  return {
    requestedMode: plan.mode,
    resolvedMode: plan.mode,
    used,
    reason,
    requestFulfilled: fulfilled,
    partialResults: partial,
    restaurants: showStandaloneCandidates ? scored.restaurants.slice(0, 20) : [],
    activities: showStandaloneCandidates ? scored.activities.slice(0, 20) : [],
    builderRestaurants: plan.restaurant.required && plan.activity.required ? diversify(scored.restaurants, 8) : [],
    builderActivities: plan.restaurant.required && plan.activity.required ? diversify(scored.activities, 8) : [],
    sameVenueResults: dual.slice(0, 20),
    pairs: pairs.slice(0, 20),
    retrievedCandidates: retrievedCount,
    geoResolution: geo,
  };
}
