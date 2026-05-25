import type { CanonicalSearchIntent, SearchPipelineResult } from "./types";

export function buildSearchResponse(intent: CanonicalSearchIntent, restaurants: any[], activities: any[], pairs: any[], matched_locations: any[], debug: any): SearchPipelineResult {
  const hasCards = restaurants.length > 0 || activities.length > 0 || matched_locations.length > 0 || pairs.length > 0;
  let reply = "No results found yet.";
  if (restaurants.length && activities.length) reply = "Found restaurant and activity options for your outing.";
  else if (restaurants.length) reply = "Found restaurant options; activity inventory is limited for this request.";
  else if (activities.length) reply = "Found activity options; restaurant inventory is limited for this request.";

  return {
    success: true,
    reply,
    intent,
    restaurants,
    activities,
    matched_locations,
    pairs,
    render_mode: hasCards ? "cards" : "empty",
    card_counts: { restaurants: restaurants.length, activities: activities.length, matched_locations: matched_locations.length, pairs: pairs.length },
    debug,
  };
}
