import { describe, expect, it } from "vitest";
import type { SearchRoutingProvider } from "@/lib/search-framework";
import { enrichEnterprisePairsWithWalkingRoutes } from "@/lib/search/enterprise/mapboxWalkingRoutes";
import type { EnterprisePair, PairingPreference } from "@/lib/search/enterprise/types";

describe("live enterprise Mapbox walking routes", () => {
  const preference: PairingPreference = {
    requiresPairing: true,
    distanceMode: "walking",
    maxPairDistanceMiles: null,
    maxPairWalkingMinutes: 20,
    requireWalkablePair: true,
  };

  it("uses verified route minutes and removes a closer-looking pair whose real walk is too long", async () => {
    const provider: SearchRoutingProvider = {
      providerId: "test.mapbox",
      async routeMatrix() {
        return {
          providerId: "test.mapbox",
          mode: "walking",
          entries: [
            {
              originId: "r1",
              destinationId: "a-good",
              distanceMiles: 1.2,
              durationMinutes: 18,
              source: "mapbox",
              confidence: "verified",
            },
            {
              originId: "r1",
              destinationId: "a-bad",
              distanceMiles: 0.8,
              durationMinutes: 28,
              source: "mapbox",
              confidence: "verified",
            },
          ],
        };
      },
    };

    const result = await enrichEnterprisePairsWithWalkingRoutes(
      [
        pair("r1", "a-good", 0.95),
        pair("r1", "a-bad", 0.6),
      ],
      preference,
      provider,
    );

    expect(result.routeRequestAttempted).toBe(true);
    expect(result.verifiedPairCount).toBe(1);
    expect(result.rejectedOverLimitCount).toBe(1);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].activity.id).toBe("a-good");
    expect(result.pairs[0].pairWalkingMinutes).toBe(18);
    expect(result.pairs[0].pairDistanceMiles).toBe(1.2);
    expect(result.pairs[0].routeDurationMinutes).toBe(18);
    expect(result.pairs[0].walkingRouteSource).toBe("mapbox");
    expect(result.pairs[0].walkingRouteConfidence).toBe("verified");
    expect(result.pairs[0].pairDistanceLabel).toBe("About a 18-minute walk");
  });

  it("fails closed for required walking pairs when the configured routing provider is unavailable", async () => {
    const provider: SearchRoutingProvider = {
      providerId: "test.mapbox",
      async routeMatrix() {
        throw new Error("provider unavailable");
      },
    };

    const result = await enrichEnterprisePairsWithWalkingRoutes(
      [pair("r1", "a1", 0.5)],
      preference,
      provider,
    );

    expect(result.routeRequestFailed).toBe(true);
    expect(result.pairs).toEqual([]);
  });

  it("keeps legacy estimates when Mapbox is not configured yet", async () => {
    const original = pair("r1", "a1", 0.5);
    const result = await enrichEnterprisePairsWithWalkingRoutes(
      [original],
      preference,
      null,
    );

    expect(result.providerConfigured).toBe(false);
    expect(result.routeRequestAttempted).toBe(false);
    expect(result.pairs).toEqual([original]);
  });
});

function pair(
  restaurantId: string,
  activityId: string,
  estimatedMiles: number,
): EnterprisePair {
  return {
    restaurant: {
      id: restaurantId,
      name: restaurantId,
      latitude: 40.75,
      longitude: -73.99,
    } as any,
    activity: {
      id: activityId,
      name: activityId,
      latitude: activityId === "a-good" ? 40.76 : 40.755,
      longitude: -73.99,
    } as any,
    title: "test",
    explanation: "test",
    pairExplanation: "test",
    score: 1,
    pairScore: 1,
    distance_miles: estimatedMiles,
    pairDistanceMiles: estimatedMiles,
    pairWalkingMinutes: Math.round(estimatedMiles * 20),
    pairDistanceLabel: `About a ${Math.round(estimatedMiles * 20)}-minute walk`,
    pairWarnings: [],
    isWalkable: true,
  };
}
