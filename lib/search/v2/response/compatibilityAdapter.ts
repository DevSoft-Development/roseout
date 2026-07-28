import type { PublicSearchResponseV2 } from "./responseTypes";

export function adaptV2ResponseToCurrentPublicContract(
  v2: PublicSearchResponseV2,
) {
  const cards =
    v2.displayMode === "pairs"
      ? []
      : [...v2.sameVenueResults, ...v2.restaurants, ...v2.activities];
  const anchorLocation = v2.anchor.location;
  const searchContext = v2.anchor.requested
    ? {
        mode: "anchored_nearby",
        heading: anchorLocation?.name
          ? `Options near ${anchorLocation.name}`
          : v2.anchor.rawName
            ? `Options near ${v2.anchor.rawName}`
            : "Options near your anchor",
        anchor_position: "before_results",
        anchor_requested: true,
        anchor_resolved: v2.anchor.resolved,
        anchor_relationship: v2.anchor.relationship,
      }
    : null;

  return {
    success: v2.success,
    reply: v2.message,
    restaurants: v2.restaurants,
    activities: v2.activities,
    matched_locations: v2.sameVenueResults,
    matchedLocations: v2.sameVenueResults,
    pairs: v2.pairs,
    builder: v2.builder,
    builder_restaurants: v2.builder.restaurants,
    builder_activities: v2.builder.activities,
    anchor: v2.anchor,
    anchor_location: anchorLocation,
    anchorLocation,
    search_context: searchContext,
    searchContext,
    cards,
    render_mode: v2.displayMode,
    renderMode: v2.displayMode,
    primary_domain: v2.primary_domain,
    primaryDomain: v2.primaryDomain,
    primaryResultType: v2.displayMode,
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
      primaryDomain: v2.primaryDomain,
      primary_domain: v2.primary_domain,
      primaryResultType: v2.displayMode,
      canonicalCounts: v2.counts,
      builderEnabled: v2.builder.enabled,
      builderRestaurantCount: v2.builder.restaurants.length,
      builderActivityCount: v2.builder.activities.length,
      anchorRequested: v2.anchor.requested,
      anchorResolved: v2.anchor.resolved,
      requestFulfilled: v2.requestFulfilled,
      partialResults: v2.partialResults,
      fallback: v2.fallback,
    },
    searchV2: v2,
  };
}