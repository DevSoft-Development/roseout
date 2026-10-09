import type { SearchV3Execution, SearchCandidate } from "@/lib/search-framework";
import type { EnterpriseLocation, EnterprisePair, EnterpriseSearchResult } from "@/lib/search/enterprise/types";

type LocationDatabase = {
  from(table: string): {
    select(columns: string): {
      in(column: string, values: readonly string[]): Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };
};

function hasDomain(candidate: SearchCandidate, domain: "restaurant" | "activity"): boolean {
  const supported = candidate.intelligence.identity.supportedDomains;
  return domain === "restaurant"
    ? supported.includes("restaurant")
    : supported.includes("activity") || supported.includes("nightlife");
}

function pairLabel(distance: number | null): string {
  return distance != null && Number.isFinite(distance)
    ? distance.toFixed(1) + " mi"
    : "Distance unavailable";
}

/**
 * Convert a validated V3 execution into the existing public outing contract.
 * Fetch authoritative location records rather than constructing incomplete
 * cards from search-intelligence features.
 *
 * If the locations cannot be fully hydrated, throw so the caller serves V2.
 */
export async function adaptV3ExecutionToEnterpriseResult(
  execution: SearchV3Execution,
  db: LocationDatabase,
): Promise<EnterpriseSearchResult> {
  const requiredIds = [...new Set([
    ...execution.candidates.map(candidate => candidate.locationId),
    ...execution.outings.flatMap(outing => [
      outing.restaurant.locationId, outing.activity.locationId,
    ]),
  ])].slice(0, 100);
  if (requiredIds.length === 0) throw new Error("v3_public_no_candidates");

  const { data, error } = await db.from("locations").select("*").in("id", requiredIds);
  if (error) throw new Error("v3_location_hydration_failed");
  const locationById = new Map<string, EnterpriseLocation>(
    (data ?? []).filter(row => row.id != null).map(row => [
      String(row.id), row as unknown as EnterpriseLocation,
    ]),
  );

  const missingIds = requiredIds.filter(id => !locationById.has(id));
  if (missingIds.length > 0) throw new Error("v3_location_hydration_incomplete");
  const getLocation = (id: string) => {
    const record = locationById.get(id);
    if (!record) throw new Error("v3_location_missing");
    return record;
  };

  const restaurants = execution.candidates
    .filter(candidate => hasDomain(candidate, "restaurant"))
    .map(candidate => getLocation(candidate.locationId));
  const activities = execution.candidates
    .filter(candidate => hasDomain(candidate, "activity"))
    .map(candidate => getLocation(candidate.locationId));

  const pairs: EnterprisePair[] = execution.outings.map(outing => {
    const restaurant = getLocation(outing.restaurant.locationId);
    const activity = getLocation(outing.activity.locationId);
    const restaurantName = restaurant.name ?? restaurant.restaurant_name ?? "Restaurant";
    const activityName = activity.name ?? activity.activity_name ?? "Activity";
    const distance = outing.distanceMiles;
    return {
      restaurant,
      activity,
      title: String(restaurantName) + " + " + String(activityName),
      explanation: outing.reasons.join(". "),
      score: outing.score,
      pairScore: outing.score,
      distance_miles: distance,
      pairDistanceMiles: distance,
      pairWalkingMinutes: outing.travelMode === "walking" ? outing.travelMinutes : null,
      routeDurationMinutes: outing.travelMinutes,
      routeDistanceMiles: outing.metadata.routeDistanceMiles,
      walkingRouteSource: outing.metadata.routeSource,
      walkingRouteConfidence: outing.metadata.routeConfidence,
      pairDistanceLabel: pairLabel(distance),
      pairWarnings: outing.metadata.withinTravelLimit === false ? ["Outside requested travel limit"] : [],
      isWalkable: outing.travelMode === "walking" &&
        outing.metadata.routeConfidence === "verified" &&
        outing.metadata.withinTravelLimit !== false,
      pair_type: "restaurant_activity",
    };
  });

  const pairingRequired = execution.intent.domains.includes("restaurant") &&
    execution.intent.domains.includes("activity");
  if (pairingRequired && pairs.length === 0) throw new Error("v3_required_pairs_missing");
  const uniqueLocations = new Map<string, EnterpriseLocation>();
  for (const location of [...restaurants, ...activities]) {
    if (location.id != null) uniqueLocations.set(String(location.id), location);
  }
  const matched = [...uniqueLocations.values()];
  if (matched.length === 0) throw new Error("v3_public_empty_result");

  const renderMode: EnterpriseSearchResult["render_mode"] =
    pairs.length > 0 ? "mixed_pairs" :
    restaurants.length && !activities.length ? "restaurant_cards" :
    activities.length && !restaurants.length ? "activity_cards" : "cards";

  const counts = {
    restaurants: restaurants.length,
    activities: activities.length,
    matched_locations: matched.length,
    pairs: pairs.length,
  };
  return {
    success: true,
    restaurants,
    activities,
    pairs,
    matched_locations: matched,
    matchedLocations: matched,
    render_mode: renderMode,
    renderMode,
    searchMode: pairingRequired ? "paired_outing" : execution.intent.primaryDomain ?? "any",
    reply: pairs.length > 0
      ? "Here are dinner-and-activity combinations matching your search."
      : "Here are places matching your search.",
    card_counts: counts,
    cardCounts: counts,
    debug: {
      searchEngine: "v3",
      v3RequestId: execution.requestId,
      v3OrchestrationVersion: execution.metadata.orchestrationVersion,
      v3LaneFailureCount: execution.metadata.retrievalFailureCount ?? 0,
    },
  };
}
