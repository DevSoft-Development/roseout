import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";

const restaurantSource = (overrides: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000000010",
  name: "Example Cafe",
  restaurantName: "Example Cafe",
  activityName: null,
  locationType: "restaurant",
  activityType: null,
  primaryCategory: "cafe",
  categories: ["cafe"],
  cuisines: [],
  foodTerms: [],
  features: [],
  description: null,
  address: "1 Main St",
  market: "NYC CORE",
  city: "New York",
  neighborhood: null,
  borough: "Manhattan",
  county: null,
  state: "NY",
  latitude: 40.75,
  longitude: -73.98,
  active: true,
  searchable: true,
  hidden: false,
  isLowLevel: false,
  ...overrides,
} as any);

describe("Google meal-service evidence", () => {
  it("treats a Google-confirmed dinner category as authoritative and clears the cafe conflict", () => {
    const profile = buildLocationSearchProfile(restaurantSource({
      categories: ["cafe", "dinner"],
      features: ["dinner"],
    }));

    expect(profile.mealPeriods).toContain("dinner");
    expect(profile.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "dinner", strength: "authoritative" }),
    ]));
    expect(profile.reviewReasons).not.toContain("cafe_dinner_conflict");
  });

  it("keeps legacy dinner keyword evidence supporting-only and reviewable", () => {
    const profile = buildLocationSearchProfile(restaurantSource({
      categories: ["cafe"],
      features: ["dinner"],
    }));

    expect(profile.mealPeriods).toContain("dinner");
    expect(profile.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "dinner", strength: "supporting" }),
    ]));
    expect(profile.reviewReasons).toContain("cafe_dinner_conflict");
  });
});
