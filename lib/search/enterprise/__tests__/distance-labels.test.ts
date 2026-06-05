import { describe, expect, it } from "vitest";
import { cleanDistanceLabel, formatDistanceFromRestaurant } from "../distance";

describe("enterprise search distance labels", () => {
  it("walking mode prefers minutes from route data", () => {
    expect(formatDistanceFromRestaurant({ pair: { walkingDurationMinutes: 6, pairDistanceMiles: 0.4 }, restaurantName: "The Modern", pairingPreference: { distanceMode: "walking", requireWalkablePair: true } })).toBe("6 min walk from The Modern");
  });

  it("walking mode estimates minutes from miles", () => {
    expect(formatDistanceFromRestaurant({ pair: { walkingDurationMinutes: null, pairDistanceMiles: 0.4 }, restaurantName: "The Modern", pairingPreference: { distanceMode: "walking", requireWalkablePair: true } })).toBe("8 min walk from The Modern");
  });

  it("any mode prefers miles", () => {
    expect(formatDistanceFromRestaurant({ pair: { walkingDurationMinutes: 8, pairDistanceMiles: 0.4 }, restaurantName: "The Modern", pairingPreference: { distanceMode: "any", requireWalkablePair: false } })).toBe("0.4 mi from The Modern");
  });

  it("unsafe walking duration falls back to miles and strips Google wording", () => {
    const raw = "288 min walk from Fogo de Chão Brazilian Steakhouse • Google walking route";
    expect(cleanDistanceLabel(raw)).toBe(undefined);
    const fallback = formatDistanceFromRestaurant({ pair: { pairDistanceLabel: raw, pairDistanceMiles: 2.4 }, restaurantName: "Fogo de Chão Brazilian Steakhouse", pairingPreference: { distanceMode: "any", requireWalkablePair: false } });
    expect(fallback).not.toContain("288 min walk");
    expect(fallback).not.toContain("Google walking route");
    expect(fallback).toBe("2.4 mi from Fogo de Chão Brazilian Steakhouse");
  });

  it("never renders Google walking route wording", () => {
    const label = cleanDistanceLabel("6 min walk from The Modern • Google walking route");
    expect(label).toBe("6 min walk from The Modern");
    expect(label).not.toContain("Google walking route");
  });
});
