import type { PublicSearchResponseV2 } from "./responseTypes";

export function adaptV2ResponseToCurrentPublicContract(
  v2: PublicSearchResponseV2,
) {
  const cards =
    v2.displayMode === "pairs"
      ? []
      : [...v2.sameVenueResults, ...v2.restaurants, ...v2.activities];

  return {
    success: v2.success,
    reply: v2.message,
    restaurants: v2.restaurants,
    activities: v2.activities,
    matched_locations: v2.sameVenueResults,
    matchedLocations: v2.sameVenueResults,
    pairs: v2.pairs,
    cards,
    render_mode: v2.displayMode,
    renderMode: v2.displayMode,

    // Preserve the current public contract while exposing scalar counts that
    // Search Lab and Search Health can read without coercing result arrays.
    restaurant_count: v2.counts.restaurantCards,
    activity_count: v2.counts.activityCards,
    pair_count: v2.counts.pairs,
    matched_location_count: v2.counts.sameVenueCards,
    result_count: v2.counts.displayedResults,

    card_counts: {
      restaurants: v2.counts.restaurantCards,
      activities: v2.counts.activityCards,
      matched_locations: v2.counts.sameVenueCards,
      pairs: v2.counts.pairs,
    },
    cardCounts: {
      restaurants: v2.counts.restaurantCards,
      activities: v2.counts.activityCards,
      matched_locations: v2.counts.sameVenueCards,
      pairs: v2.counts.pairs,
    },
    requestId: v2.requestId,
    searchCoreVersion: "v2",
    requestFulfilled: v2.requestFulfilled,
    partialResults: v2.partialResults,
    fallback: v2.fallback,
    timing: v2.timing,
    ml: v2.ml,
    debug: {
      searchCoreVersion: "v2",
      requestedMode: v2.requestedMode,
      resolvedMode: v2.resolvedMode,
      displayMode: v2.displayMode,
      canonicalCounts: v2.counts,
      requestFulfilled: v2.requestFulfilled,
      partialResults: v2.partialResults,
      fallback: v2.fallback,
    },
    searchV2: v2,
  };
}
