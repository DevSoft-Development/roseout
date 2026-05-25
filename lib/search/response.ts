import type { CanonicalSearchIntent, SearchPipelineResult } from "@/lib/search/types";

export function buildSearchResponse(
  intent: CanonicalSearchIntent,
  restaurants: any[],
  activities: any[],
  pairs: any[],
  matchedLocations: any[],
  debug?: any,
): SearchPipelineResult {
  const hasCards = restaurants.length > 0 || activities.length > 0 || matchedLocations.length > 0 || pairs.length > 0;
  const reply = restaurants.length && activities.length
    ? "Found food and activity options for your outing."
    : restaurants.length
      ? "Found restaurant matches. Activity inventory is limited for this request."
      : activities.length
        ? "Found activity matches. Restaurant inventory is limited for this request."
        : "No matching records found yet.";

  return {
    success: true,
    reply,
    intent,
    restaurants,
    activities,
    matched_locations: matchedLocations,
    pairs,
    render_mode: hasCards ? "cards" : "empty",
    card_counts: {
      restaurants: restaurants.length,
      activities: activities.length,
      matched_locations: matchedLocations.length,
      pairs: pairs.length,
    },
    debug,
  };
}
