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

function sameVenueIsOptional(plan: SearchPlan) {
  const query = plan.rawQuery.toLowerCase();
  const offersNearbyAlternative =
    /\b(?:same (?:venue|place)|one (?:venue|place)|under one roof)\b[\s\S]{0,80}\b(?:or|otherwise|alternatively)\b[\s\S]{0,80}\b(?:nearby|close|paired|pair)\b/.test(query) ||
    /\b(?:either|preferably)\b[\s\S]{0,80}\b(?:same (?:venue|place)|one (?:venue|place))\b[\s\S]{0,80}\b(?:or|but)\b/.test(query);
  return Boolean(plan.pairing.sameVenuePreferred && offersNearbyAlternative);
}

function broadGenericDateNight(plan: SearchPlan) {
  return plan.occasion === "date_night"
    && plan.restaurant.cuisines.length === 0
    && plan.restaurant.foods.length === 0
    && plan.restaurant.features.length === 0
    && plan.restaurant.mealPeriods.length === 0;
}

function dateSuitabilityAdjustment(item: ScoredCandidate) {
  for (const reason of item.reasons) {
    const boost = reason.match(/date-night suitability boost \+(\d+)/i);
    if (boost) return Number(boost[1]);
    const demotion = reason.match(/date-night suitability demotion (-\d+)/i);
    if (demotion) return Number(demotion[1]);
    if (/date-night suitability neutral/i.test(reason)) return 0;
  }
  return 0;
}

function dateSuitabilityTier(adjustment: number) {
  if (adjustment >= 7) return 0;
  if (adjustment >= 0) return 1;
  if (adjustment > -20) return 2;
  return 3;
}

export function rankBroadDateNightRestaurants(items: ScoredCandidate[]) {
  return [...items].sort((a, b) => {
    const aAdjustment = dateSuitabilityAdjustment(a);
    const bAdjustment = dateSuitabilityAdjustment(b);
    return dateSuitabilityTier(aAdjustment) - dateSuitabilityTier(bAdjustment)
      || bAdjustment - aAdjustment
      || b.scores.total - a.scores.total;
  });
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
  const broadDateNight = broadGenericDateNight(plan);
  const restaurantPool = broadDateNight ? rankBroadDateNightRestaurants(scored.restaurants) : scored.restaurants;
  const restaurants = restaurantPool.slice(0, 20);
  const activities = scored.activities.slice(0, 20);
  const dual = restaurants.filter((restaurant) => activities.some((activity) => String(activity.candidate.candidate.location.id) === String(restaurant.candidate.candidate.location.id)));
  const optionalSameVenue = sameVenueIsOptional(plan);
  const effectiveMode = plan.mode === "same_venue" && optionalSameVenue ? "paired_outing" : plan.mode;
  const effectiveSameVenueRequired = plan.pairing.sameVenueRequired && !optionalSameVenue;
  const allowNearbyPair = plan.fallback.allowNearbyPair || optionalSameVenue;
  const hasRestaurant = !plan.restaurant.required || restaurants.length > 0;
  const hasActivity = !plan.activity.required || activities.length > 0;
  const hasPair = pairs.length > 0;
  const hasSameVenue = dual.length > 0;

  const fulfilled = effectiveMode === "restaurant_only"
    ? hasRestaurant
    : effectiveMode === "activity_only"
      ? hasActivity
      : effectiveMode === "same_venue"
        ? hasSameVenue || (!effectiveSameVenueRequired && allowNearbyPair && hasPair)
        : effectiveMode === "paired_outing"
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
  } else if (effectiveMode === "same_venue" && !hasSameVenue && hasPair) {
    reason = "no_strong_same_venue_match";
  }

  const partial = !fulfilled && (restaurants.length > 0 || activities.length > 0) && plan.fallback.allowPartial;
  const used = reason != null;
  trace.fallback = { used, reason };
  if (broadDateNight) {
    const selectedAdjustments = restaurants.map(dateSuitabilityAdjustment);
    trace.decisions.push({
      stage: "date_suitability_selection",
      decision: "occasion_fit_tier_precedes_general_score",
      reason: JSON.stringify({
        candidatePoolCount: scored.restaurants.length,
        selectedCount: restaurants.length,
        positiveSelected: selectedAdjustments.filter((value) => value >= 7).length,
        neutralSelected: selectedAdjustments.filter((value) => value === 0).length,
        weakSelected: selectedAdjustments.filter((value) => value < 0 && value > -20).length,
        poorSelected: selectedAdjustments.filter((value) => value <= -20).length,
        suppressionApplied: false,
      }),
    });
  }
  trace.decisions.push({
    stage: "same_venue_policy",
    decision: optionalSameVenue ? "preference_with_nearby_fallback" : effectiveSameVenueRequired ? "hard_same_venue" : "not_required",
    reason: JSON.stringify({ originalMode: plan.mode, effectiveMode, optionalSameVenue, allowNearbyPair }),
  });
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
    requestedMode: effectiveMode,
    resolvedMode: effectiveMode,
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
