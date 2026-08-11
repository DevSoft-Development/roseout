import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";

const base = {
  id: "perfume-making-1",
  name: "Custom Scent Studio",
  restaurantName: null,
  activityName: "Custom Scent Studio",
  locationType: "activity",
  activityType: "perfume_making",
  primaryCategory: "perfume_making",
  categories: [],
  cuisines: [],
  foodTerms: [],
  features: [],
  description: "Custom fragrance experience with guided scent blending.",
  address: null,
  market: "NYC",
  city: "New York",
  neighborhood: null,
  borough: "Manhattan",
  county: null,
  state: "NY",
  latitude: 40.75,
  longitude: -73.99,
  active: true,
  searchable: true,
  hidden: false,
  isLowLevel: false,
} as const;

describe("perfume making taxonomy", () => {
  it("classifies explicit perfume-making experiences as authoritative activities", () => {
    const profile = buildLocationSearchProfile(base);

    expect(profile.primaryDomain).toBe("activity");
    expect(profile.activityCategories).toContain("perfume_making");
    expect(profile.canonicalTerms).toContain("perfume making");
    expect(profile.confidence).toBeGreaterThanOrEqual(0.6);
    expect(profile.reviewReasons).not.toContain("low_confidence");
    expect(profile.exclusions).not.toContain("unsupported_non_outing");
  });

  it("does not unsuppress a proven fragrance retail store", () => {
    const profile = buildLocationSearchProfile({
      ...base,
      id: "perfume-retail-1",
      name: "Luxury Perfume Retail Store",
      activityType: "retail store",
      primaryCategory: "retail store",
      description: "Perfume and fragrance retail store.",
    });

    expect(profile.exclusions).toContain("unsupported_non_outing");
    expect(profile.reviewReasons).toContain("unsupported_non_outing");
    expect(profile.confidence).toBeLessThanOrEqual(0.2);
  });
});
