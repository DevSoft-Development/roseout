import { shouldBypassSearchCache } from "./cache";
import { searchActivities, searchFallbackActivities, searchFallbackRestaurants, searchRestaurants } from "./database";
import { parseCanonicalIntent } from "./intent";
import { buildOutingPairs } from "./pairing";
import { rankActivities, rankRestaurants } from "./ranking";
import { buildSearchResponse } from "./response";
import type { SearchPipelineResult } from "./types";

export async function runTheOutHavenSearch(input: string, body?: any): Promise<SearchPipelineResult> {
  const intent = parseCanonicalIntent(input, body);
  const cache = shouldBypassSearchCache(intent);
  intent.cacheBypassReasons = cache.reasons;

  if (intent.isOffTopic) {
    return buildSearchResponse(intent, [], [], [], [], {
      search_system: "clean-search-v1",
      restaurantSearchInput: intent.restaurantSearchInput,
      activitySearchInput: intent.activitySearchInput,
      cache_status: cache,
      fallback_used: false,
      off_topic_result: true,
      ranking_notes: [],
    });
  }

  let restaurants = intent.wantsRestaurant ? await searchRestaurants(intent) : [];
  let activities = intent.wantsActivity ? await searchActivities(intent) : [];
  let fallback_used = false;
  if (intent.wantsFood && intent.wantsActivity && restaurants.length === 0) {
    restaurants = await searchFallbackRestaurants(intent);
    fallback_used = true;
  }
  if (intent.wantsActivity && activities.length === 0) {
    activities = await searchFallbackActivities(intent);
    fallback_used = true;
  }

  restaurants = rankRestaurants(restaurants, intent);
  activities = rankActivities(activities, intent);
  const pairs = buildOutingPairs(restaurants, activities, intent);

  return buildSearchResponse(intent, restaurants, activities, pairs, [], {
    search_system: "clean-search-v1",
    restaurantSearchInput: intent.restaurantSearchInput,
    activitySearchInput: intent.activitySearchInput,
    cache_status: cache,
    fallback_used,
    off_topic_result: false,
    ranking_notes: ["canonical-intent", "split-restaurant-activity-search"],
  });
}
