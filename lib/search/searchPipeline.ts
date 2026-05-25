import { shouldBypassSearchCache } from "@/lib/search/cache";
import { searchActivities, searchFallbackActivities, searchFallbackRestaurants, searchRestaurants } from "@/lib/search/database";
import { parseCanonicalIntent } from "@/lib/search/intent";
import { buildOutingPairs } from "@/lib/search/pairing";
import { buildActivitySearchInput, buildRestaurantSearchInput } from "@/lib/search/queryBuilders";
import { rankActivities, rankRestaurants } from "@/lib/search/ranking";
import { buildSearchResponse } from "@/lib/search/response";
import type { SearchPipelineResult } from "@/lib/search/types";

export async function runTheOutHavenSearch(input: string, body?: any): Promise<SearchPipelineResult> {
  const intent = parseCanonicalIntent(input, body);
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

  let restaurants = intent.wantsRestaurant ? await searchRestaurants(intent) : [];
  let activities = intent.wantsActivity ? await searchActivities(intent) : [];
  let fallback_used = { restaurants: false, activities: false };

  if (intent.wantsFood && intent.wantsActivity && restaurants.length === 0) {
    restaurants = await searchFallbackRestaurants(intent);
    fallback_used.restaurants = true;
  }
  if (intent.wantsActivity && activities.length === 0) {
    activities = await searchFallbackActivities(intent);
    fallback_used.activities = true;
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
    ranking_notes: "canonical ranking",
  });
}
