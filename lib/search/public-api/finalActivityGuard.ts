import { qualifyExplicitActivityIntent } from "@/lib/search/enterprise/taxonomy";
import {
  qualifyKaraokeCandidate,
  qualifyHookahCandidate,
  qualifyRelaxedActivity,
  qualifySportsWatchCandidate,
} from "@/lib/search/enterprise/activityQualification";
import {
  candidateMatchesExplicitActivityConstraint,
  resolveExplicitActivityConstraint,
} from "@/lib/search/enterprise/explicitActivityConstraint";
import { canonicalTaxonomy } from "@/lib/search/v2/taxonomy";
import { extractNegativeConstraints } from "@/lib/search/v2/planner/languageUnderstanding";

const GENERIC_ACTIVITY_TERMS = new Set([
  "activity",
  "activities",
  "things to do",
  "experience",
]);

const SPORTS_QUERY = /\b(knicks|sports?\s*(bar|lounge|viewing)|watch\s+(the\s+)?game|basketball|football|baseball|hockey)\b/i;

type PublicSearchResult = Record<string, any>;

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function locationKey(value: any): string {
  return String(
    value?.id ??
      value?.source_id ??
      value?.google_place_id ??
      [value?.name, value?.restaurant_name, value?.activity_name, value?.address]
        .filter(Boolean)
        .join("|"),
  ).toLowerCase();
}

function isV2Result(result: PublicSearchResult): boolean {
  return Boolean(
    result?.searchCoreVersion === "v2" ||
      result?.assignedEngine === "v2" ||
      result?.searchCoreAssignment?.engine === "v2" ||
      result?.debug?.searchCoreVersion === "v2" ||
      result?.debug?.assignedEngine === "v2",
  );
}

function reconcileExplicitV2ActivityCandidates(
  rawResult: PublicSearchResult,
  topLevelActivities: any[],
  explicitConstraintApplied: boolean,
): {
  activities: any[];
  used: boolean;
  topLevelCount: number;
  v2Count: number;
} {
  const nestedActivities = Array.isArray(rawResult?.searchV2?.activities)
    ? rawResult.searchV2.activities
    : [];
  const topLevelCount = topLevelActivities.length;
  const v2Count = nestedActivities.length;
  const v2ActivityRequired = rawResult?.searchV2?.searchPlan?.activity?.required === true;

  if (
    (!explicitConstraintApplied && !v2ActivityRequired) ||
    !isV2Result(rawResult) ||
    v2Count <= topLevelCount
  ) {
    return {
      activities: topLevelActivities,
      used: false,
      topLevelCount,
      v2Count,
    };
  }

  // V2 has already completed geo, taxonomy, domain, language-exclusion, and
  // publishability checks by the time these cards reach the compatibility
  // contract. If an outer compatibility layer accidentally narrows that set,
  // restore the V2 ordering here and immediately re-run any true positive
  // explicit activity constraint below.
  const topLevelByKey = new Map(
    topLevelActivities
      .map((activity) => [locationKey(activity), activity] as const)
      .filter(([key]) => Boolean(key)),
  );
  const merged: any[] = [];
  const seen = new Set<string>();

  for (const nested of nestedActivities) {
    const key = locationKey(nested);
    if (!key || seen.has(key)) continue;
    const topLevel = topLevelByKey.get(key);
    merged.push(topLevel ? { ...nested, ...topLevel } : nested);
    seen.add(key);
  }

  for (const topLevel of topLevelActivities) {
    const key = locationKey(topLevel);
    if (!key || seen.has(key)) continue;
    merged.push(topLevel);
    seen.add(key);
  }

  return {
    activities: merged,
    used: true,
    topLevelCount,
    v2Count,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queryIncludesPhrase(query: string, phrase: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}([^a-z0-9]|$)`, "i").test(query);
}

function explicitActivityTermsFromNormalizedIntent(result: PublicSearchResult): string[] {
  const normalizedIntent =
    result?.debug?.normalizedIntent ?? result?.normalizedIntent ?? null;
  const activityIntent =
    normalizedIntent?.activityIntent ?? normalizedIntent?.activity ?? null;
  const searchPlanActivity =
    result?.searchV2?.searchPlan?.activity ??
    result?.debug?.searchV2?.searchPlan?.activity ??
    result?.debug?.searchPlan?.activity ??
    null;

  const planCategoryTerms = stringArray(searchPlanActivity?.categories);
  if (isV2Result(result) && searchPlanActivity) {
    return unique(planCategoryTerms)
      .map((term) => term.replaceAll("_", " "))
      .filter((term) => !GENERIC_ACTIVITY_TERMS.has(term));
  }

  const activityTerms = stringArray([
    ...stringArray(activityIntent?.activityTerms),
    ...stringArray(normalizedIntent?.activityTerms),
  ]);
  const categoryTerms = stringArray([
    ...stringArray(activityIntent?.categoryTerms),
    ...stringArray(normalizedIntent?.categoryTerms),
    ...stringArray(normalizedIntent?.activityCategories),
    ...planCategoryTerms,
  ]);

  return unique([...activityTerms, ...categoryTerms])
    .map((term) => term.replaceAll("_", " "))
    .filter((term) => !GENERIC_ACTIVITY_TERMS.has(term));
}

function explicitActivityTermsFromQuery(cleanInput: string): string[] {
  const excludedActivityIds = new Set(
    extractNegativeConstraints(cleanInput).activity.map((term) => String(term).toLowerCase()),
  );
  const taxonomyTerms = canonicalTaxonomy
    .filter(
      (entry) =>
        (entry.domain === "activity" || entry.domain === "nightlife") &&
        !excludedActivityIds.has(entry.id.toLowerCase()),
    )
    .flatMap((entry) => {
      const matchedAliases = entry.aliases.filter((alias) =>
        queryIncludesPhrase(cleanInput, alias),
      );
      if (matchedAliases.length === 0) return [];
      return [entry.id.replaceAll("_", " "), ...matchedAliases];
    });

  const terms = unique(taxonomyTerms.map((term) => term.toLowerCase()));
  if (SPORTS_QUERY.test(cleanInput) && !excludedActivityIds.has("sports_bar")) terms.push("sports bar");

  return unique(terms).filter((term) => !GENERIC_ACTIVITY_TERMS.has(term));
}

function activityFromPair(pair: any): any | null {
  return pair?.activity ?? pair?.activity_location ?? pair?.activityLocation ?? null;
}

function restaurantFromPair(pair: any): any | null {
  return pair?.restaurant ?? pair?.restaurant_location ?? pair?.restaurantLocation ?? null;
}

function uniquePairsByVenue(pairs: any[], limit = Number.POSITIVE_INFINITY): any[] {
  const restaurantKeys = new Set<string>();
  const activityKeys = new Set<string>();
  const selected: any[] = [];

  for (const pair of pairs) {
    const restaurant = restaurantFromPair(pair);
    const activity = activityFromPair(pair);
    const restaurantKey = restaurant ? locationKey(restaurant) : "";
    const activityKey = activity ? locationKey(activity) : "";

    if (!restaurantKey || !activityKey) continue;
    if (restaurantKeys.has(restaurantKey) || activityKeys.has(activityKey)) continue;

    restaurantKeys.add(restaurantKey);
    activityKeys.add(activityKey);
    selected.push(pair);
    if (selected.length >= limit) break;
  }

  return selected;
}

function strongIntentEvidence(value: any, cleanInput: string): boolean {
  if (/\bkaraoke\b/i.test(cleanInput)) return qualifyKaraokeCandidate(value).matches;
  if (/\bhookah\b|\bshisha\b/i.test(cleanInput)) return qualifyHookahCandidate(value).matches;
  if (SPORTS_QUERY.test(cleanInput)) return qualifySportsWatchCandidate(value).matches;
  if (/\b(relaxed|relaxing|chill|low[ -]?key|casual activity)\b/i.test(cleanInput)) {
    return qualifyRelaxedActivity(value).matches;
  }
  return false;
}

function recoveryProvenance(value: any): boolean {
  return Boolean(
    value?.recovery_generated ||
      value?.post_filter_recovery ||
      value?.recoveryGenerated ||
      value?._recoveryCandidate ||
      value?.search_recovery_source,
  );
}

function qualifiesActivity(value: any, terms: string[], cleanInput: string): boolean {
  const explicitConstraint = resolveExplicitActivityConstraint(cleanInput);
  if (explicitConstraint.applied) {
    return candidateMatchesExplicitActivityConstraint(value, explicitConstraint);
  }

  const taxonomyMatch = qualifyExplicitActivityIntent(value, terms).matches;
  if (taxonomyMatch) return true;
  if (strongIntentEvidence(value, cleanInput)) return true;
  return recoveryProvenance(value) && strongIntentEvidence(value, cleanInput);
}

function pairHasQualifiedActivity(pair: any, terms: string[], cleanInput: string): boolean {
  const activity = activityFromPair(pair);
  if (!activity) return true;
  return qualifiesActivity(activity, terms, cleanInput);
}

function cardHasQualifiedActivity(card: any, terms: string[], cleanInput: string): boolean {
  if (card?.result_role === "activity") return qualifiesActivity(card, terms, cleanInput);
  const locationType = card?.location_type ?? card?.locationType;
  if (locationType === "activity") return qualifiesActivity(card, terms, cleanInput);
  if (locationType && locationType !== "activity") return true;
  if (card?.activity_name || card?.activity_type) return qualifiesActivity(card, terms, cleanInput);
  return true;
}

function promoteRestaurantTypedActivities(
  restaurants: any[],
  cleanInput: string,
): { restaurants: any[]; promoted: any[] } {
  if (!SPORTS_QUERY.test(cleanInput)) return { restaurants, promoted: [] };
  const promoted = restaurants
    .filter((row) => strongIntentEvidence(row, cleanInput))
    .map((row) => ({
      ...row,
      activity_name: row.activity_name ?? row.name ?? row.restaurant_name,
      activity_type: row.activity_type ?? "sports_bar",
      cross_domain_activity: true,
      cross_domain_promoted: true,
      result_role: "activity",
      public_activity_role: "sports_watch",
      source_location_type: row.location_type ?? null,
      recovery_generated: true,
    }));
  const promotedKeys = new Set(promoted.map(locationKey));
  return {
    restaurants: restaurants.filter((row) => !promotedKeys.has(locationKey(row))),
    promoted,
  };
}

function milesBetween(a: any, b: any): number | null {
  const lat1 = Number(a?.latitude);
  const lon1 = Number(a?.longitude);
  const lat2 = Number(b?.latitude);
  const lon2 = Number(b?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function regenerateScarceActivityPairs(restaurants: any[], activities: any[], maxMiles = 3): any[] {
  const candidates: any[] = [];
  for (const activity of activities) {
    for (const restaurant of restaurants) {
      const distance = milesBetween(restaurant, activity);
      if (distance == null || distance > maxMiles) continue;
      candidates.push({
        restaurant,
        activity,
        pair_distance_miles: Number(distance.toFixed(2)),
        distance_miles: Number(distance.toFixed(2)),
        pair_walking_minutes: Math.round(distance * 20),
        walking_minutes: Math.round(distance * 20),
        pairScore: Math.max(0, 100 - distance * 20),
        score: Math.max(0, 100 - distance * 20),
        recovery_generated: true,
        scarce_activity_centered: true,
      });
    }
  }
  const ranked = candidates.sort((a, b) => b.pairScore - a.pairScore);
  return uniquePairsByVenue(ranked, 3);
}

function pairingRecoveryPolicy(rawResult: PublicSearchResult) {
  const plan =
    rawResult?.searchV2?.searchPlan ??
    rawResult?.debug?.searchV2?.searchPlan ??
    rawResult?.debug?.searchPlan ??
    rawResult?.searchPlan ??
    null;
  const mode = String(
    plan?.mode ??
      rawResult?.searchV2?.resolvedMode ??
      rawResult?.resolvedMode ??
      rawResult?.requestedMode ??
      "",
  );
  const hardSameVenue = mode === "same_venue" || plan?.pairing?.sameVenueRequired === true;
  const planRequestsPairing =
    !hardSameVenue &&
    (mode === "paired_outing" ||
      mode === "mixed_outing" ||
      (plan?.restaurant?.required === true && plan?.activity?.required === true));
  return { mode, hardSameVenue, planRequestsPairing };
}

export function resolveFinalPublicActivityTerms(
  result: PublicSearchResult,
  cleanInput: string,
): string[] {
  const explicitConstraint = resolveExplicitActivityConstraint(cleanInput);
  if (explicitConstraint.applied) {
    return explicitConstraint.requestedIds.map((term) => term.replaceAll("_", " "));
  }

  const normalizedIntentTerms = explicitActivityTermsFromNormalizedIntent(result);
  if (normalizedIntentTerms.length > 0) return normalizedIntentTerms;
  return explicitActivityTermsFromQuery(cleanInput);
}

export function applyFinalPublicActivityGuard<T extends PublicSearchResult>(
  rawResult: T,
  cleanInput: string,
): T {
  const explicitConstraint = resolveExplicitActivityConstraint(cleanInput);
  const normalizedIntentTerms = explicitActivityTermsFromNormalizedIntent(rawResult);
  const terms = explicitConstraint.applied
    ? explicitConstraint.requestedIds.map((term) => term.replaceAll("_", " "))
    : normalizedIntentTerms.length > 0
      ? normalizedIntentTerms
      : explicitActivityTermsFromQuery(cleanInput);
  const rawRestaurants = Array.isArray(rawResult.restaurants) ? rawResult.restaurants : [];
  const topLevelActivities = Array.isArray(rawResult.activities) ? rawResult.activities : [];
  const v2Reconciliation = reconcileExplicitV2ActivityCandidates(
    rawResult,
    topLevelActivities,
    explicitConstraint.applied,
  );
  const baseActivities = v2Reconciliation.activities;
  const promotion = promoteRestaurantTypedActivities(rawRestaurants, cleanInput);
  const activityMap = new Map<string, any>();
  for (const activity of [...baseActivities, ...promotion.promoted]) {
    if (terms.length === 0 || qualifiesActivity(activity, terms, cleanInput)) {
      activityMap.set(locationKey(activity), activity);
    }
  }
  const activities = Array.from(activityMap.values());
  const originalPairs = Array.isArray(rawResult.pairs) ? rawResult.pairs : [];
  let pairs = terms.length === 0
    ? originalPairs
    : originalPairs.filter((pair: any) => pairHasQualifiedActivity(pair, terms, cleanInput));
  const pairsBeforeUniqueness = pairs.length;

  const recoveryPolicy = pairingRecoveryPolicy(rawResult);
  const legacyWantsPairing = Boolean(
    rawResult?.debug?.wantsPairing ??
      rawResult?.debug?.debugParity?.wantsPairing ??
      rawResult?.debug?.normalizedIntent?.wantsPairing,
  );
  const wantsPairing =
    !recoveryPolicy.hardSameVenue &&
    (recoveryPolicy.planRequestsPairing || legacyWantsPairing);
  if (wantsPairing && pairs.length === 0 && promotion.restaurants.length > 0 && activities.length > 0) {
    pairs = regenerateScarceActivityPairs(promotion.restaurants, activities);
  }

  pairs = uniquePairsByVenue(pairs);
  const duplicatePairsRemoved = Math.max(0, pairsBeforeUniqueness - pairs.length);

  const filteredCards = Array.isArray(rawResult.cards)
    ? rawResult.cards.filter((card: any) => terms.length === 0 || cardHasQualifiedActivity(card, terms, cleanInput))
    : [];
  const cardKeys = new Set(
    filteredCards.map((card: any) => locationKey(card)).filter(Boolean),
  );
  const cards = [...filteredCards];
  for (const activity of activities) {
    const key = locationKey(activity);
    if (!key || cardKeys.has(key)) continue;
    cards.push(activity);
    cardKeys.add(key);
  }
  const debug = {
    ...(rawResult.debug ?? {}),
    finalPublicActivityGuard: {
      terms,
      source: explicitConstraint.applied
        ? "raw_query_explicit_activity_constraint"
        : normalizedIntentTerms.length > 0
          ? "normalized_intent_or_v2_plan"
          : "canonical_taxonomy_query_fallback",
      explicitConstraintApplied: explicitConstraint.applied,
      explicitRequestedActivityIds: explicitConstraint.requestedIds,
      explicitMatchedAliases: explicitConstraint.matchedAliases,
      topLevelActivityCountBeforeV2Reconciliation: v2Reconciliation.topLevelCount,
      v2ActivityCandidateCount: v2Reconciliation.v2Count,
      v2ActivityReconciliationUsed: v2Reconciliation.used,
      baseActivityCount: baseActivities.length,
      qualifiedActivityCount: activities.length,
      removedActivities: baseActivities.length - activities.filter((row) => !row.cross_domain_activity).length,
      removedPairs: Math.max(0, originalPairs.length - pairs.length),
      duplicatePairsRemoved,
      pairVenueUniquenessEnforced: true,
      preservedRecoveryActivities: activities.filter(recoveryProvenance).length,
      promotedRestaurantTypedActivities: promotion.promoted.length,
      scarceActivityCenteredPairs: pairs.filter((pair) => pair?.scarce_activity_centered).length,
      pairingRecoveryMode: recoveryPolicy.mode,
      authoritativePlanPairing: recoveryPolicy.planRequestsPairing,
      hardSameVenueRecoverySuppressed: recoveryPolicy.hardSameVenue,
      legacyWantsPairing,
      wantsPairing,
    },
    qualifiedActivityCount: activities.length,
    primaryPairCount: pairs.length,
    counts: {
      ...(rawResult.debug?.counts ?? {}),
      qualifiedActivityCount: activities.length,
      primaryPairCount: pairs.length,
    },
  };

  return {
    ...rawResult,
    restaurants: promotion.restaurants,
    activities,
    pairs,
    cards,
    no_pairs_reason: pairs.length > 0 ? null : rawResult.no_pairs_reason,
    noPairsReason: pairs.length > 0 ? null : rawResult.noPairsReason,
    debug,
  };
}
