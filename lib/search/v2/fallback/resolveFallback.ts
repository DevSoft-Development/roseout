import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ScoredCandidate } from "../scoring/scoringTypes";
import type { SearchPair } from "../pairing/pairingTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { runtimeAliases, runtimeRetrievalTerms } from "../taxonomy/runtimeTaxonomy";
import type { FallbackReason, GeoResolution, ResolvedSearchResult } from "./fallbackTypes";

function locationId(item: ScoredCandidate) {
  return String(item.candidate.candidate.location.id ?? "");
}

function locationOf(item: ScoredCandidate) {
  return item.candidate.candidate.location as any;
}

function normalizeEvidence(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_–—-]+/g, " ")
    .replace(/[^a-z0-9+\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceText(item: ScoredCandidate) {
  const location = locationOf(item);
  const fields = [
    location?.name,
    location?.restaurant_name,
    location?.activity_name,
    location?.description,
    location?.short_description,
    location?.location_type,
    location?.type,
    location?.primary_category,
    location?.cuisine,
    location?.cuisine_type,
    location?.activity_type,
    location?.category,
    location?.semantic_search_text,
    location?.search_document,
    location?.tags,
    location?.vibe_tags,
    location?.best_for_tags,
    location?.intent_tags,
    location?.search_keywords,
    location?.google_types,
    location?.features,
    location?.special_features,
  ];
  return normalizeEvidence(
    fields
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter(Boolean)
      .join(" "),
  );
}

function containsEvidence(text: string, rawTerm: string) {
  const term = normalizeEvidence(rawTerm);
  if (!term) return false;
  return (` ${text} `).includes(` ${term} `);
}

function exclusionTerms(ids: readonly string[]) {
  return [...new Set(
    ids.flatMap((id) => [id.replaceAll("_", " "), ...runtimeAliases(id)]),
  )];
}

function violatesTaxonomyExclusions(item: ScoredCandidate, ids: readonly string[]) {
  if (!ids.length) return false;
  const text = evidenceText(item);
  return exclusionTerms(ids).some((term) => containsEvidence(text, term));
}

function genericActivityCapabilityTerms(query: string) {
  const q = normalizeEvidence(query);
  const terms: string[] = [];
  if (/\blive performances?\b/.test(q)) {
    terms.push(
      "live performance",
      "performance",
      "live entertainment",
      "entertainment",
      "show",
      "event venue",
      "live music venue",
      "music venue",
      "theater",
      "theatre",
    );
  } else if (/\blive entertainment\b|\bentertainment\b/.test(q)) {
    terms.push(
      "live entertainment",
      "entertainment",
      "show",
      "event venue",
      "live music venue",
      "music venue",
    );
  } else if (/\blive shows?\b|\bshows?\b/.test(q)) {
    terms.push(
      "live show",
      "show",
      "performance",
      "event venue",
      "theater",
      "theatre",
      "live music venue",
    );
  }
  return [...new Set(terms)];
}

function requestedActivityEvidenceTerms(plan: SearchPlan) {
  const taxonomyTerms = [
    ...plan.activity.categories.flatMap((category) => runtimeRetrievalTerms(category)),
    ...plan.activity.features.flatMap((feature) => runtimeRetrievalTerms(feature)),
  ];
  return [...new Set([...taxonomyTerms, ...genericActivityCapabilityTerms(plan.rawQuery)])];
}

function candidateSupportsActivityPlan(item: ScoredCandidate, plan: SearchPlan) {
  const terms = requestedActivityEvidenceTerms(plan);
  if (!terms.length) return false;
  const text = evidenceText(item);
  return terms.some((term) => containsEvidence(text, term));
}

function diversify(items: ScoredCandidate[], limit = 8) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = locationId(item);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, limit);
}

function sameLocationPair(pair: SearchPair) {
  return Boolean(locationId(pair.restaurant) && locationId(pair.restaurant) === locationId(pair.activity));
}

function pairPassesExclusions(pair: SearchPair, plan: SearchPlan) {
  return !violatesTaxonomyExclusions(pair.restaurant, plan.restaurant.exclusions)
    && !violatesTaxonomyExclusions(pair.activity, plan.activity.exclusions);
}

function sameVenueCandidates(
  restaurants: ScoredCandidate[],
  activities: ScoredCandidate[],
  plan: SearchPlan,
  limit = 20,
) {
  const activityById = new Map<string, ScoredCandidate>();
  for (const activity of activities) {
    const id = locationId(activity);
    if (!id) continue;
    const current = activityById.get(id);
    if (!current || activity.scores.total > current.scores.total) activityById.set(id, activity);
  }

  return diversify(
    restaurants
      .filter((restaurant) => {
        const id = locationId(restaurant);
        return activityById.has(id) || candidateSupportsActivityPlan(restaurant, plan);
      })
      .sort((left, right) => {
        const leftActivity = activityById.get(locationId(left));
        const rightActivity = activityById.get(locationId(right));
        const leftCapabilityBoost = candidateSupportsActivityPlan(left, plan) ? 20 : 0;
        const rightCapabilityBoost = candidateSupportsActivityPlan(right, plan) ? 20 : 0;
        const leftScore = left.scores.total + (leftActivity?.scores.total ?? 0) + leftCapabilityBoost;
        const rightScore = right.scores.total + (rightActivity?.scores.total ?? 0) + rightCapabilityBoost;
        return rightScore - leftScore;
      }),
    limit,
  );
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
  const rankedRestaurantPool = broadDateNight ? rankBroadDateNightRestaurants(scored.restaurants) : scored.restaurants;
  const restaurantPool = rankedRestaurantPool.filter(
    (candidate) => !violatesTaxonomyExclusions(candidate, plan.restaurant.exclusions),
  );
  const activityPool = scored.activities.filter(
    (candidate) => !violatesTaxonomyExclusions(candidate, plan.activity.exclusions),
  );
  const optionalSameVenue = sameVenueIsOptional(plan);
  const effectiveMode = plan.mode === "same_venue" && optionalSameVenue ? "paired_outing" : plan.mode;
  const effectiveSameVenueRequired = plan.pairing.sameVenueRequired && !optionalSameVenue;
  const allowNearbyPair = plan.fallback.allowNearbyPair || optionalSameVenue;

  trace.decisions.push({
    stage: "hard_exclusion_filter",
    decision: "full_candidate_pools_filtered_before_caps",
    reason: JSON.stringify({
      restaurantExclusions: plan.restaurant.exclusions,
      activityExclusions: plan.activity.exclusions,
      restaurantBefore: rankedRestaurantPool.length,
      restaurantAfter: restaurantPool.length,
      activityBefore: scored.activities.length,
      activityAfter: activityPool.length,
    }),
  });

  // Search the complete qualified pools before card truncation. A valid dual-role
  // venue may rank outside the first 20 in one lane, and a restaurant can prove a
  // same-venue activity capability directly from its canonical profile evidence.
  const dual = sameVenueCandidates(restaurantPool, activityPool, plan, 20);
  const compatiblePairs = (effectiveSameVenueRequired ? pairs.filter(sameLocationPair) : pairs)
    .filter((pair) => pairPassesExclusions(pair, plan));
  const restaurants = restaurantPool.slice(0, 20);
  const activities = activityPool.slice(0, 20);
  const hasRestaurant = !plan.restaurant.required || restaurants.length > 0 || dual.length > 0;
  const hasActivity = !plan.activity.required || activities.length > 0 || dual.length > 0;
  const hasPair = compatiblePairs.length > 0;
  const hasSameVenue = dual.length > 0 || compatiblePairs.length > 0;

  const fulfilled = effectiveMode === "restaurant_only"
    ? hasRestaurant
    : effectiveMode === "activity_only"
      ? hasActivity
      : effectiveMode === "same_venue"
        ? hasSameVenue || (!effectiveSameVenueRequired && allowNearbyPair && hasPair)
        : effectiveMode === "paired_outing"
          ? hasRestaurant && hasActivity && hasPair
          : hasRestaurant;

  const geo = buildGeoResolution({ restaurants: restaurantPool, activities: activityPool }, compatiblePairs);
  let reason: FallbackReason | null = null;
  if (!fulfilled) {
    const primaryPairingFailure = pairingFailure(trace);
    reason = retrievedCount === 0
      ? "no_candidates_retrieved"
      : effectiveSameVenueRequired && !hasSameVenue
        ? "no_strong_same_venue_match"
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
        candidatePoolCount: restaurantPool.length,
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
    reason: JSON.stringify({
      originalMode: plan.mode,
      effectiveMode,
      optionalSameVenue,
      allowNearbyPair,
      restaurantPoolCount: restaurantPool.length,
      activityPoolCount: activityPool.length,
      activityEvidenceTerms: requestedActivityEvidenceTerms(plan),
      sameVenueCandidateCount: dual.length,
      compatiblePairCount: compatiblePairs.length,
    }),
  });
  trace.decisions.push({
    stage: "result_preservation_contract",
    decision: "domain_lanes_preserved",
    reason: JSON.stringify({
      restaurantCount: restaurants.length,
      activityCount: activities.length,
      pairCount: compatiblePairs.length,
      sameVenueCount: dual.length,
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
    sameVenueResults: dual,
    pairs: compatiblePairs.slice(0, 20),
    retrievedCandidates: retrievedCount,
    geoResolution: geo,
  };
}
