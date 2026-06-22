import { shouldBypassSearchCache } from "./cache";
import { searchActivities, searchFallbackActivities, searchFallbackRestaurants, searchRestaurants, type SearchDebug } from "./database";
import { parseCanonicalIntent } from "./intent";
import { buildOutingPairs } from "./pairing";
import { buildActivitySearchInput, buildRestaurantSearchInput } from "./queryBuilders";
import { rankActivities, rankRestaurants } from "./ranking";
import { buildSearchResponse } from "./response";
import { wantsSoftHours } from "./hours";
import type { SearchPipelineResult } from "./types";

function mergeSourceErrors(...groups: Array<string[] | undefined>) {
  return Array.from(new Set(groups.flatMap((group) => group ?? [])));
}

function uniqById(records: any[]) {
  return Array.from(new Map(records.map((record) => [String(record?.id ?? `${record?.name ?? ""}-${record?.address ?? ""}`), record])).values());
}

function isLateNightActivityRecoveryQuery(intent: ReturnType<typeof parseCanonicalIntent>) {
  return /late[- ]?night|tonight|something open|open after midnight|after midnight|\bafter\b|open late/i.test(`${intent.rawQuery} ${intent.normalizedQuery}`);
}

function createSafeActivityRecoveryIntent(intent: ReturnType<typeof parseCanonicalIntent>) {
  const recoveryTerms = ["activity", "things to do", "entertainment", "lounge", "bar", "cocktails", "karaoke", "comedy", "arcade", "bowling", "live music", "rooftop", "dessert", "cafe"];
  return {
    ...intent,
    activitySearchInput: [
      ...intent.boroughs,
      ...intent.neighborhoods,
      ...(intent.locations ?? []),
      ...(intent.cities ?? []),
      ...recoveryTerms,
    ].join(" "),
    normalizedIntent: intent.normalizedIntent
      ? { ...intent.normalizedIntent, activityTerms: recoveryTerms }
      : intent.normalizedIntent,
    activityIntents: recoveryTerms,
    addOnIntent: [],
  };
}

function createSafeRestaurantRecoveryIntent(intent: ReturnType<typeof parseCanonicalIntent>) {
  const cuisineTerms = [
    ...(intent.normalizedIntent?.cuisineTerms ?? []),
    ...intent.cuisines,
    ...(intent.specificMealFoodIntents ?? []),
  ].filter((term) => /italian|seafood|steakhouse|steak|brunch|lunch|pizza|pasta|greek|sushi|mexican|caribbean|vegan|halal/i.test(String(term)));
  const recoveryTerms = Array.from(new Set(["restaurant", "dinner", "food", ...cuisineTerms.map(String)]));

  return {
    ...intent,
    restaurantSearchInput: [
      ...intent.boroughs,
      ...intent.neighborhoods,
      ...(intent.locations ?? []),
      ...(intent.cities ?? []),
      ...recoveryTerms,
    ].join(" "),
    normalizedIntent: intent.normalizedIntent
      ? {
          ...intent.normalizedIntent,
          restaurantTerms: recoveryTerms,
          mealTerms: recoveryTerms,
          cuisineTerms: [],
          vibeTerms: [],
        }
      : intent.normalizedIntent,
    specificMealFoodIntents: [],
    mealFoodIntents: recoveryTerms,
    cuisines: [],
    requiredRestaurantCategory: null,
  };
}

export async function runTheOutHavenSearch(input: string, body?: any): Promise<SearchPipelineResult> {
  const intent = parseCanonicalIntent(input, body);
  if (process.env.NODE_ENV !== "production") {
    console.log("[create-intent-debug]", {
      llmIntentRaw: body?.searchIntent ?? body?.normalizedIntent ?? body?.llmIntent ?? body?.intent ?? null,
      normalizedIntent: intent.normalizedIntent,
    });
  }
  if (intent.isOffTopic) {
    return {
      success: false,
      reply: "I can help with restaurants, activities, nightlife, brunch, and date ideas.",
      intent,
      restaurants: [],
      activities: [],
      matched_locations: [],
      pairs: [],
      render_mode: "text",
      card_counts: { restaurants: 0, activities: 0, matched_locations: 0, pairs: 0 },
      debug: { search_system: "clean-search-v1", off_topic_result: true },
    };
  }

  intent.restaurantSearchInput = buildRestaurantSearchInput(intent);
  intent.activitySearchInput = buildActivitySearchInput(intent);
  const cache = shouldBypassSearchCache(intent);
  intent.cacheBypassReasons = cache.reasons;

  const [restaurantSearch, activitySearch]: [{ records: any[]; debug: SearchDebug }, { records: any[]; debug: SearchDebug }] = await Promise.all([
    intent.needsRestaurant ? searchRestaurants(intent) : Promise.resolve({ records: [], debug: { searchedTables: [], rpcCalls: [] } }),
    intent.needsActivity ? searchActivities(intent) : Promise.resolve({ records: [], debug: { searchedTables: [], rpcCalls: [] } }),
  ]);

  let restaurants = restaurantSearch.records;
  let activities = activitySearch.records;
  let fallback_used = { restaurants: false, activities: false };

  if (intent.needsRestaurant && restaurants.length === 0) {
    const recoveryIntent =
      intent.needsActivity && activities.length > 0
        ? createSafeRestaurantRecoveryIntent(intent)
        : intent;
    const fallbackRestaurants = await searchFallbackRestaurants(recoveryIntent);
    restaurants = uniqById(fallbackRestaurants.records);
    fallback_used.restaurants = true;
    restaurantSearch.debug.sourceErrors = mergeSourceErrors(restaurantSearch.debug.sourceErrors, fallbackRestaurants.debug.sourceErrors);
    restaurantSearch.debug.restaurantTermsUsed = fallbackRestaurants.debug.restaurantTermsUsed;
    (restaurantSearch.debug as any).restaurantRecoveryUsed = recoveryIntent !== intent;
    (restaurantSearch.debug as any).restaurantRecoveryReason = recoveryIntent !== intent ? "restaurant_recovery_terms_relaxed" : undefined;
    (restaurantSearch.debug as any).restaurantRecoveryTermsRelaxed = recoveryIntent !== intent;
  }
  if (intent.needsActivity && activities.length === 0) {
    const recoveryIntent = intent.needsRestaurant && isLateNightActivityRecoveryQuery(intent)
      ? createSafeActivityRecoveryIntent(intent)
      : intent;
    const fallbackActivities = await searchFallbackActivities(recoveryIntent);
    activities = uniqById(fallbackActivities.records);
    fallback_used.activities = true;
    activitySearch.debug.sourceErrors = mergeSourceErrors(activitySearch.debug.sourceErrors, fallbackActivities.debug.sourceErrors);
    activitySearch.debug.activityTermsUsed = fallbackActivities.debug.activityTermsUsed;
    (activitySearch.debug as any).activityRecoveryUsed = recoveryIntent !== intent;
    (activitySearch.debug as any).activityRecoveryReason = recoveryIntent !== intent ? "late_night_activity_recovery" : undefined;
  }

  restaurants = rankRestaurants(restaurants, intent);
  activities = rankActivities(activities, intent);
  const pairs = buildOutingPairs(restaurants, activities, intent);
  const matchedLocations = Array.from(new Map(
    [...restaurants, ...activities].map((item: any) => [String(item?.id ?? `${item?.name ?? ""}-${item?.title ?? ""}`), item])
  ).values());

  const empty_reason = restaurants.length === 0 && activities.length === 0
    ? (fallback_used.restaurants || fallback_used.activities ? "fallback_attempted_no_cards" : "strict_category_filter_removed_all")
    : undefined;

  const devDebug = process.env.NODE_ENV !== "production" ? {
    llmIntentRaw: body?.searchIntent ?? body?.normalizedIntent ?? body?.llmIntent ?? body?.intent ?? null,
    normalizedIntent: intent.normalizedIntent,
    sameVenuePreferred: intent.sameVenuePreferred ?? intent.normalizedIntent?.sameVenuePreferred ?? false,
    sequenceDetected: intent.sequenceDetected ?? intent.normalizedIntent?.sequenceDetected ?? false,
    proximityDetected: intent.proximityDetected ?? intent.normalizedIntent?.proximityDetected ?? false,
    coLocationTermsMatched: intent.coLocationTermsMatched ?? intent.normalizedIntent?.coLocationTermsMatched ?? [],
    sequenceTermsMatched: intent.sequenceTermsMatched ?? intent.normalizedIntent?.sequenceTermsMatched ?? [],
    proximityTermsMatched: intent.proximityTermsMatched ?? intent.normalizedIntent?.proximityTermsMatched ?? [],
    sameVenueReason: intent.sameVenueReason ?? intent.normalizedIntent?.sameVenueReason ?? null,
    sameVenueCandidateCount: intent.normalizedIntent?.sameVenuePreferred ? restaurants.length + activities.length : 0,
    whyNormalizedSearchTypeSelected: intent.normalizedIntent?.sameVenuePreferred
      ? "sameVenuePreferred suppressed mixed_outing/pair requirement"
      : intent.wantsPairing
        ? "sequencing/proximity or explicit multi-stop intent requested pairing"
        : "single-domain intent",
    restaurantTermsUsed: restaurantSearch.debug.restaurantTermsUsed ?? intent.normalizedIntent?.restaurantTerms ?? [],
    activityTermsUsed: activitySearch.debug.activityTermsUsed ?? intent.normalizedIntent?.activityTerms ?? [],
    geoUsed: intent.normalizedIntent?.geo ?? null,
    restaurantResultsBeforeFilter: restaurantSearch.debug.rawRestaurantCount ?? 0,
    restaurantResultsAfterFilter: restaurantSearch.debug.afterCategoryFilterRestaurantCount ?? 0,
    activityResultsBeforeFilter: activitySearch.debug.rawActivityCount ?? 0,
    activityResultsAfterFilter: activitySearch.debug.afterCategoryFilterActivityCount ?? 0,
    removedRestaurantBecauseOfActivityTerms: restaurantSearch.debug.removedRestaurantBecauseOfActivityTerms ?? 0,
    removedActivityBecauseOfRestaurantTerms: activitySearch.debug.removedActivityBecauseOfRestaurantTerms ?? 0,
  } : {};

  return buildSearchResponse(intent, restaurants, activities, pairs, matchedLocations, {
    search_system: "clean-search-v1",
    query: input,
    restaurantSearchInput: intent.restaurantSearchInput,
    activitySearchInput: intent.activitySearchInput,
    ...devDebug,
    searchedTables: Array.from(new Set([...(restaurantSearch.debug.searchedTables ?? []), ...(activitySearch.debug.searchedTables ?? [])])),
    rpcCalls: Array.from(new Set([...(restaurantSearch.debug.rpcCalls ?? []), ...(activitySearch.debug.rpcCalls ?? [])])),
    sourceErrors: mergeSourceErrors(restaurantSearch.debug.sourceErrors, activitySearch.debug.sourceErrors),
    rejectedRecords: [...(restaurantSearch.debug.rejectedRecords ?? []), ...(activitySearch.debug.rejectedRecords ?? [])],
    rawRestaurantCount: restaurantSearch.debug.rawRestaurantCount ?? 0,
    rawActivityCount: activitySearch.debug.rawActivityCount ?? 0,
    afterGeoFilterRestaurantCount: restaurantSearch.debug.afterGeoFilterRestaurantCount ?? 0,
    afterGeoFilterActivityCount: activitySearch.debug.afterGeoFilterActivityCount ?? 0,
    afterCategoryFilterRestaurantCount: restaurantSearch.debug.afterCategoryFilterRestaurantCount ?? 0,
    afterCategoryFilterActivityCount: activitySearch.debug.afterCategoryFilterActivityCount ?? 0,
    geoStrictRequired: restaurantSearch.debug.geoStrictRequired ?? activitySearch.debug.geoStrictRequired ?? false,
    geoIntent: restaurantSearch.debug.geoIntent ?? activitySearch.debug.geoIntent ?? intent.geoIntent ?? null,
    geoFilteredByQueryCount: (restaurantSearch.debug.geoFilteredByQueryCount ?? 0) + (activitySearch.debug.geoFilteredByQueryCount ?? 0),
    geoFilteredByIntentCount: (restaurantSearch.debug.geoFilteredByIntentCount ?? 0) + (activitySearch.debug.geoFilteredByIntentCount ?? 0),
    geoFilteredFinalCount: (restaurantSearch.debug.geoFilteredFinalCount ?? 0) + (activitySearch.debug.geoFilteredFinalCount ?? 0),
    rankedRestaurantCount: restaurants.length,
    rankedActivityCount: activities.length,
    fallbackRestaurantUsed: fallback_used.restaurants,
    fallbackActivityUsed: fallback_used.activities,
    restaurantRecoveryUsed: (restaurantSearch.debug as any).restaurantRecoveryUsed ?? false,
    restaurantRecoveryReason: (restaurantSearch.debug as any).restaurantRecoveryReason ?? null,
    restaurant_recovery_used: (restaurantSearch.debug as any).restaurantRecoveryUsed ?? false,
    restaurant_recovery_terms_relaxed: (restaurantSearch.debug as any).restaurantRecoveryTermsRelaxed ?? false,
    activity_recovery_used: (activitySearch.debug as any).activityRecoveryUsed ?? false,
    late_night_activity_recovery: (activitySearch.debug as any).activityRecoveryReason === "late_night_activity_recovery",
    soft_hours_filter_used: wantsSoftHours(intent),
    hours_filter_mode: wantsSoftHours(intent) ? "soft" : null,
    hours_debug_reason: wantsSoftHours(intent) ? "late_night_hours_soft_filter" : null,
    finalCardCounts: { restaurants: restaurants.length, activities: activities.length, matched_locations: matchedLocations.length, pairs: pairs.length },
    cache_status: cache,
    off_topic_result: false,
    ranking_notes: "canonical ranking",
    empty_reason,
  });
}
