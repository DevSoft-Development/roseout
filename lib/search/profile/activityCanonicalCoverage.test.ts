import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "./buildLocationSearchProfile";
import type { LocationProfileSource } from "./profileTypes";

function source(overrides: Partial<LocationProfileSource>): LocationProfileSource {
  return {
    id: crypto.randomUUID(),
    name: "Test activity",
    locationType: "activity",
    active: true,
    searchable: true,
    hidden: false,
    isLowLevel: false,
    ...overrides,
  };
}

describe("activity canonical profile coverage", () => {
  it.each([
    ["Mission Escape Games", "escape_room", "escape_room"],
    ["Cutting Edge Axe Throwing", "axe_throwing", "axe_throwing"],
    ["Liberty Paintball", "paintball", "paintball"],
  ])("maps authoritative production values for %s", (name, activityType, expected) => {
    const profile = buildLocationSearchProfile(source({
      name,
      activityType,
      primaryCategory: activityType,
      categories: [activityType],
    }));

    expect(profile.primaryDomain).toBe("activity");
    expect(profile.activityCategories).toContain(expected);
    expect(profile.canonicalTerms).toContain(expected);
    expect(profile.canonicalTerms.length).toBeGreaterThan(0);
  });

  it.each([
    ["Hey Clay Pottery Studio", "pottery"],
    ["Nose Best: Candle Making Classes", "candle_making"],
    ["Freeport Kayak Rentals", "kayaking"],
    ["City Ice Pavilion", "ice_skating"],
    ["Immersive Gamebox - Lower East Side", "arcade"],
  ])("uses unambiguous name evidence for %s", (name, expected) => {
    const profile = buildLocationSearchProfile(source({
      name,
      activityType: "activity",
      primaryCategory: "activity",
      categories: ["activity"],
    }));

    expect(profile.activityCategories).toContain(expected);
    expect(profile.canonicalTerms).toContain(expected);
  });

  it("does not invent a specific category for an ambiguous generic activity", () => {
    const profile = buildLocationSearchProfile(source({
      name: "Event Space",
      activityType: "activity",
      primaryCategory: "activity",
      categories: ["activity"],
    }));

    expect(profile.primaryDomain).toBe("activity");
    expect(profile.activityCategories).toEqual([]);
    expect(profile.needsReview).toBe(true);
  });
});
