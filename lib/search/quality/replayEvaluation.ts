export type ServedDomain = "restaurant" | "activity";

function primaryDomainOf(item: any): string | null {
  const value = item?.primary_domain
    ?? item?.primaryDomain
    ?? item?.search_profile?.primary_domain
    ?? item?.searchProfile?.primaryDomain
    ?? item?.profile?.primary_domain
    ?? item?.profile?.primaryDomain
    ?? null;
  return typeof value === "string" ? value.toLowerCase() : null;
}

function addSlotMismatch(
  mismatches: Array<{ slot: ServedDomain; primaryDomain: string | null; id: string | null }>,
  slot: ServedDomain,
  item: any,
) {
  const primary = primaryDomainOf(item);
  const valid = slot === "restaurant"
    ? primary === null || primary === "restaurant"
    : primary === null || primary === "activity" || primary === "nightlife";
  if (!valid) {
    mismatches.push({
      slot,
      primaryDomain: primary,
      id: item?.id ?? item?.location_id ?? null,
    });
  }
}

export function responseDomainInventory(response: any) {
  const restaurants = Array.isArray(response?.restaurants) ? response.restaurants : [];
  const activities = Array.isArray(response?.activities) ? response.activities : [];
  const sameVenueResults = Array.isArray(response?.sameVenueResults) ? response.sameVenueResults : [];
  const pairs = Array.isArray(response?.pairs) ? response.pairs : [];
  const builderRestaurants = Array.isArray(response?.builder?.restaurants) ? response.builder.restaurants : [];
  const builderActivities = Array.isArray(response?.builder?.activities) ? response.builder.activities : [];

  const restaurantItems = [
    ...restaurants,
    ...pairs.map((pair: any) => pair?.restaurant).filter(Boolean),
    ...builderRestaurants,
  ];
  const activityItems = [
    ...activities,
    ...pairs.map((pair: any) => pair?.activity).filter(Boolean),
    ...builderActivities,
  ];

  const servedDomains = new Set<ServedDomain>();
  if (restaurantItems.length || sameVenueResults.length) servedDomains.add("restaurant");
  if (activityItems.length || sameVenueResults.length) servedDomains.add("activity");

  const slotMismatches: Array<{ slot: ServedDomain; primaryDomain: string | null; id: string | null }> = [];
  restaurantItems.forEach((item) => addSlotMismatch(slotMismatches, "restaurant", item));
  activityItems.forEach((item) => addSlotMismatch(slotMismatches, "activity", item));

  return {
    servedDomains,
    slotMismatches,
    counts: {
      restaurant: restaurantItems.length + sameVenueResults.length,
      activity: activityItems.length + sameVenueResults.length,
      pairs: pairs.length,
      sameVenue: sameVenueResults.length,
      uniqueResults: restaurantItems.length + activityItems.length + sameVenueResults.length,
    },
  };
}

export function countResponseResults(response: any) {
  return responseDomainInventory(response).counts.uniqueResults;
}
