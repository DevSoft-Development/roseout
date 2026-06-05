import { describe, expect, it } from "vitest";
import { getSafeWalkingMinutes, shouldHidePairForWalkingLimit, shouldRejectPairForWalkingRoute } from "../distance";
import { createPairingDebug, createSearchPairs, scorePairQuality, sortPairs } from "../pairing";
import { restaurants, activities, makeIntent, runFixturePipeline } from "./fixtures";
import type { EnterprisePair, PairingPreference } from "../types";

const walkingPreference: PairingPreference = {
  requiresPairing: true,
  distanceMode: "walking",
  maxPairDistanceMiles: 1.5,
  maxPairWalkingMinutes: 30,
  requireWalkablePair: true,
};

describe("enterprise search pairing", () => {
  it("keeps valid walking pairs and rejects invalid route durations", () => {
    const pairs = [
      { id: "A", walkingDurationMinutes: 18, pairDistanceMiles: 0.8 },
      { id: "B", walkingDurationMinutes: 30, pairDistanceMiles: 1.5 },
      { id: "C", walkingDurationMinutes: 31, pairDistanceMiles: 1.4 },
      { id: "D", walkingDurationMinutes: 496, pairDistanceMiles: 0.6 },
      { id: "E", walkingDurationMinutes: null, pairDistanceMiles: 0.4 },
    ];
    const kept = pairs.filter((pair) => !shouldRejectPairForWalkingRoute(pair, walkingPreference).reject).map((pair) => pair.id);
    expect(kept).toContain("A");
    expect(kept).toContain("B");
    expect(shouldRejectPairForWalkingRoute(pairs[2], walkingPreference).reason).toBe("walking_route_exceeds_requested_minutes");
    expect(shouldRejectPairForWalkingRoute(pairs[3], walkingPreference).reason).toBe("extreme_walking_route_duration");
    expect(kept).toContain("E");
    expect(getSafeWalkingMinutes(pairs[4])).toBe(8);
  });

  it("hides walking pairs over the effective walking cap", () => {
    const defaultWalkingPreference: PairingPreference = {
      requiresPairing: true,
      distanceMode: "walking",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: true,
    };

    expect(shouldHidePairForWalkingLimit({ walkingDurationMinutes: 158 }, defaultWalkingPreference)).toEqual({
      hide: true,
      reason: "walking_route_exceeds_default_60_minutes",
    });
    expect(shouldHidePairForWalkingLimit({ walkingDurationMinutes: 61 }, defaultWalkingPreference)).toEqual({
      hide: true,
      reason: "walking_route_exceeds_default_60_minutes",
    });
    expect(shouldHidePairForWalkingLimit({ walkingDurationMinutes: 60 }, defaultWalkingPreference)).toEqual({
      hide: false,
      reason: null,
    });
    expect(shouldHidePairForWalkingLimit({ walkingDurationMinutes: 45 }, defaultWalkingPreference)).toEqual({
      hide: false,
      reason: null,
    });
    expect(shouldHidePairForWalkingLimit({ walkingDurationMinutes: 45 }, { ...defaultWalkingPreference, maxPairWalkingMinutes: 30 })).toEqual({
      hide: true,
      reason: "walking_route_exceeds_requested_minutes",
    });
    expect(shouldHidePairForWalkingLimit({ walkingDurationMinutes: 90 }, { ...defaultWalkingPreference, distanceMode: "any", requireWalkablePair: false })).toEqual({
      hide: false,
      reason: null,
    });
  });

  it("applies the default 60-minute walking route cap", () => {
    const defaultWalkingPreference: PairingPreference = {
      requiresPairing: true,
      distanceMode: "walking",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: true,
    };

    expect(shouldRejectPairForWalkingRoute({ walkingDurationMinutes: 45 }, defaultWalkingPreference)).toEqual({
      reject: false,
      reason: null,
    });
    expect(shouldRejectPairForWalkingRoute({ walkingDurationMinutes: 61 }, defaultWalkingPreference)).toEqual({
      reject: true,
      reason: "walking_route_exceeds_default_60_minutes",
    });
    expect(shouldRejectPairForWalkingRoute({ walkingDurationMinutes: 158 }, defaultWalkingPreference)).toEqual({
      reject: true,
      reason: "walking_route_exceeds_default_60_minutes",
    });
    expect(shouldRejectPairForWalkingRoute({ walkingDurationMinutes: 45 }, { ...defaultWalkingPreference, maxPairWalkingMinutes: 30 })).toEqual({
      reject: true,
      reason: "walking_route_exceeds_requested_minutes",
    });
    expect(shouldRejectPairForWalkingRoute({ walkingDurationMinutes: 158 }, { ...defaultWalkingPreference, distanceMode: "any", requireWalkablePair: false })).toEqual({
      reject: false,
      reason: null,
    });
  });

  it("increments walking rejection debug for a 158-minute route", () => {
    const intent = {
      ...makeIntent("restaurant with activity walking distance"),
      wantsPairing: true,
      pairingPreference: {
        requiresPairing: true,
        distanceMode: "walking",
        maxPairDistanceMiles: null,
        maxPairWalkingMinutes: null,
        requireWalkablePair: true,
      } satisfies PairingPreference,
    };
    const debug = createPairingDebug();
    const pairs = createSearchPairs(
      [restaurants[0]],
      [{ ...activities[0], walkingDurationMinutes: 158 }],
      intent,
      debug,
    );

    expect(pairs.length).toBe(0);
    expect(debug.pairsRejectedForWalkingMinutes).toBe(1);
    expect(debug.walkingPairsHiddenOverLimit).toBe(1);
    expect(debug.walkingPairRejectReasons.walking_route_exceeds_default_60_minutes).toBe(1);
    expect(debug.rejectedPairs[0]?.reason).toBe("walking_route_exceeds_default_60_minutes");
    expect(debug.rejectedPairs[0]?.walkingDurationMinutes).toBe(158);
  });

  it("reports no walking pairs instead of no activities when both lanes have results", () => {
    const result = runFixturePipeline("steak dinner and rooftop drinks 1 minute walk apart in Queens");
    expect(result.restaurants.length).toBeGreaterThan(0);
    expect(result.activities.length).toBeGreaterThan(0);
    expect(result.pairs.length).toBe(0);
    expect(result.noPairsReason).toBe("no_pairs_within_walking_distance");
  });

  it("sorts pair quality before tiny distance", () => {
    const intent = makeIntent("restaurant and rooftop drinks after walking distance");
    const strongRestaurant = restaurants.find((r) => r.name === "La Grande Boucherie")!;
    const weakRestaurant = restaurants.find((r) => r.name === "MOE EATS NYC")!;
    const strongActivity = activities.find((a) => a.name === "Magic Hour Rooftop Bar & Lounge")!;
    const weakActivity = activities.find((a) => a.name === "Rooftop Bars NYC")!;
    const pairs = [
      { restaurant: weakRestaurant, activity: strongActivity, pairDistanceMiles: 0.06, distance_miles: 0.06 },
      { restaurant: strongRestaurant, activity: strongActivity, pairDistanceMiles: 0.20, distance_miles: 0.20 },
      { restaurant: strongRestaurant, activity: weakActivity, pairDistanceMiles: 0.12, distance_miles: 0.12 },
    ].map((pair) => {
      const quality = scorePairQuality(pair, intent);
      return { ...pair, title: "", explanation: "", score: quality.score, pairScore: quality.score, pairWalkingMinutes: null, pairDistanceLabel: "", pairWarnings: [], isWalkable: true, pairQualityScore: quality.score, pairQualityTier: quality.tier } as EnterprisePair;
    });
    const sorted = sortPairs(pairs, intent.geo);
    expect(sorted[0].restaurant.name).toBe("La Grande Boucherie");
    expect(sorted[0].activity.name).toBe("Magic Hour Rooftop Bar & Lounge");
    expect(sorted.indexOf(pairs[1])).toBeLessThan(sorted.indexOf(pairs[2]));
  });
});
