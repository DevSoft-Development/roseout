import { shouldBypassSearchCache } from "./cache";
import { searchActivities, searchFallbackActivities, searchFallbackRestaurants, searchRestaurants, type SearchDebug } from "./database";
import { parseCanonicalIntent } from "./intent";
import { buildOutingPairs } from "./pairing";
import { buildActivitySearchInput, buildRestaurantSearchInput } from "./queryBuilders";
import { rankActivities, rankRestaurants } from "./ranking";
import { buildSearchResponse } from "./response";
import type { SearchPipelineResult } from "./types";

function mergeSourceErrors(...groups: Array<string[] | undefined>) {
  return Array.from(new Set(groups.flatMap((group) => group ?? [])));
}

function createSafeRestaurantRecoveryIntent(intent: ReturnType<typeof parseCanonicalIntent>) {
  const recoveryTerms = ["dinner", "restaurant", "food"];
  if (/late[- ]?night|after midnight|open after midnight/i.test(intent.rawQuery)) {
    recoveryTerms.unshift("late night dinner");
  }

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

  const restaurantSearch: { records: any[]; debug: SearchDebug } = intent.needsRestaurant ? await searchRestaurants(intent) : { records: [], debug: { searchedTables: [], rpcCalls: [] } };
  const activitySearch: { records: any[]; debug: SearchDebug } = intent.needsActivity ? await searchActivities(intent) : { records: [], debug: { searchedTables: [], rpcCalls: [] } };

  let restaurants = restaurantSearch.records;
  let activities = activitySearch.records;
  let fallback_used = { restaurants: false, activities: false };

  if (intent.needsRestaurant && restaurants.length === 0) {
    const recoveryIntent =
      intent.needsActivity && activities.length > 0
        ? createSafeRestaurantRecoveryIntent(intent)
        : intent;
    const fallbackRestaurants = await searchFallbackRestaurants(recoveryIntent);
    restaurants = fallbackRestaurants.records;
    fallback_used.restaurants = true;
    restaurantSearch.debug.sourceErrors = mergeSourceErrors(restaurantSearch.debug.sourceErrors, fallbackRestaurants.debug.sourceErrors);
    restaurantSearch.debug.restaurantTermsUsed = fallbackRestaurants.debug.restaurantTermsUsed;
    (restaurantSearch.debug as any).restaurantRecoveryUsed = recoveryIntent !== intent;
    (restaurantSearch.debug as any).restaurantRecoveryReason = recoveryIntent !== intent ? "mixed_outing_zero_restaurants_safe_recovery" : undefined;
  }
  if (intent.needsActivity && activities.length === 0) {
    const fallbackActivities = await searchFallbackActivities(intent);
    activities = fallbackActivities.records;
    fallback_used.activities = true;
    activitySearch.debug.sourceErrors = mergeSourceErrors(activitySearch.debug.sourceErrors, fallbackActivities.debug.sourceErrors);
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
    finalCardCounts: { restaurants: restaurants.length, activities: activities.length, matched_locations: matchedLocations.length, pairs: pairs.length },
    cache_status: cache,
    off_topic_result: false,
    ranking_notes: "canonical ranking",
    empty_reason,
  });
}
