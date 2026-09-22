import { describe, expect, it } from "vitest";
import {
  MAX_WALKING_DISTANCE_MINUTES,
  estimateWalkingMinutes,
  walkingMinutesToMiles,
  isWalkablePair,
} from "../distance";
import { buildPairDistanceLabel } from "../pairing";
import type { EnterpriseLocation, PairingPreference } from "../types";

function loc(overrides: Partial<EnterpriseLocation>): EnterpriseLocation {
  return {
    id: "id",
    name: "Test Location",
    domain: "restaurant",
    location_type: "restaurant",
    latitude: null,
    longitude: null,
    match_score: 0,
    term_score: 0,
    geo_score: 0,
    ...overrides,
  } as EnterpriseLocation;
}

describe("enterprise walking distance rules", () => {
  it("uses a 60-minute general walking cap", () => {
    expect(MAX_WALKING_DISTANCE_MINUTES).toBe(60);
    expect(walkingMinutesToMiles(60)).toBe(3);
  });

  it("estimates walking minutes at 20 minutes per mile", () => {
    expect(estimateWalkingMinutes(1)).toBe(20);
    expect(estimateWalkingMinutes(1.5)).toBe(30);
    expect(estimateWalkingMinutes(3)).toBe(60);
  });

  it("labels null pair distance as unavailable", () => {
    expect(buildPairDistanceLabel(null)).toBe("Distance unavailable");
  });

  it("does not mark missing coordinates as walkable when walking is requested", () => {
    const preference: PairingPreference = {
      requiresPairing: true,
      distanceMode: "walking",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: 60,
      requireWalkablePair: true,
    };

    const restaurant = loc({ id: "r1", latitude: null, longitude: null });
    const activity = loc({ id: "a1", latitude: 40.7128, longitude: -74.006 });

    const result = isWalkablePair(restaurant, activity, preference);

    expect(result.isWalkable).toBe(false);
    expect(result.pairDistanceMiles).toBeNull();
    expect(result.pairWalkingMinutes).toBeNull();
  });

  it("respects explicit 30-minute walking limit", () => {
    const preference: PairingPreference = {
      requiresPairing: true,
      distanceMode: "walking",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: 30,
      requireWalkablePair: true,
    };

    const restaurant = loc({
      id: "r1",
      latitude: 40.758,
      longitude: -73.9855,
    });

    const nearbyActivity = loc({
      id: "a1",
      latitude: 40.768,
      longitude: -73.9855,
    });

    const farActivity = loc({
      id: "a2",
      latitude: 40.82,
      longitude: -73.9855,
    });

    expect(isWalkablePair(restaurant, nearbyActivity, preference).isWalkable).toBe(true);
    expect(isWalkablePair(restaurant, farActivity, preference).isWalkable).toBe(false);
  });
  it("rejects pairs beyond nearby distance mode limits", () => {
    const preference: PairingPreference = {
      requiresPairing: true,
      distanceMode: "nearby",
      maxPairDistanceMiles: 1.5,
      maxPairWalkingMinutes: 30,
      requireWalkablePair: true,
    };
    const restaurant = loc({ id: "r1", latitude: 40, longitude: -74 });
    const activityAtMiles = (id: string, miles: number) =>
      loc({ id, latitude: 40, longitude: -74 + miles / 53 });

    expect(isWalkablePair(restaurant, activityAtMiles("a1", 0.15), preference).isWalkable).toBe(true);
    expect(isWalkablePair(restaurant, activityAtMiles("a2", 0.8), preference).isWalkable).toBe(true);
    expect(isWalkablePair(restaurant, activityAtMiles("a3", 1.4), preference).isWalkable).toBe(true);
    expect(isWalkablePair(restaurant, activityAtMiles("a4", 2.5), preference).isWalkable).toBe(false);
    expect(isWalkablePair(restaurant, activityAtMiles("a5", 10.01), preference).isWalkable).toBe(false);
  });

  it("allows same-borough default pairs beyond the old 3-mile cap", () => {
    const preference: PairingPreference = {
      requiresPairing: true,
      distanceMode: "any",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    };
    const restaurant = loc({
      id: "r1",
      borough: "Queens",
      latitude: 40.758,
      longitude: -73.92,
    });
    const activity = loc({
      id: "a1",
      borough: "Queens",
      latitude: 40.69,
      longitude: -73.80,
    });

    const result = isWalkablePair(restaurant, activity, preference);

    expect(result.pairDistanceMiles).not.toBeNull();
    expect(result.pairDistanceMiles!).toBeGreaterThan(3);
    expect(result.isWalkable).toBe(true);
  });

  it("rejects cross-borough default pairs even when geographically close", () => {
    const preference: PairingPreference = {
      requiresPairing: true,
      distanceMode: "any",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    };
    const restaurant = loc({
      id: "r1",
      borough: "Manhattan",
      latitude: 40.7527,
      longitude: -73.9772,
    });
    const activity = loc({
      id: "a1",
      borough: "Queens",
      latitude: 40.7506,
      longitude: -73.9402,
    });

    expect(isWalkablePair(restaurant, activity, preference).isWalkable).toBe(false);
  });

  it("keeps the 3-mile fallback when borough metadata is unavailable", () => {
    const preference: PairingPreference = {
      requiresPairing: true,
      distanceMode: "any",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    };
    const restaurant = loc({
      id: "r1",
      borough: null,
      latitude: 40,
      longitude: -74,
    });
    const nearActivity = loc({
      id: "a1",
      borough: null,
      latitude: 40,
      longitude: -74 + 2 / 53,
    });
    const farActivity = loc({
      id: "a2",
      borough: null,
      latitude: 40,
      longitude: -74 + 4 / 53,
    });

    expect(isWalkablePair(restaurant, nearActivity, preference).isWalkable).toBe(true);
    expect(isWalkablePair(restaurant, farActivity, preference).isWalkable).toBe(false);
  });

});
