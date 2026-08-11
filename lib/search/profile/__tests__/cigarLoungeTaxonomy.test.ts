import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";

const base = {
  id: "cigar-lounge-1",
  name: "Test Cigar Lounge",
  restaurantName: null,
  activityName: "Test Cigar Lounge",
  locationType: "activity",
  activityType: "cigar",
  primaryCategory: "cigar",
  categories: [],
  cuisines: [],
  foodTerms: [],
  features: [],
  description: null,
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

describe("cigar lounge taxonomy", () => {
  it("classifies cigar venues as adult-only nightlife with authoritative confidence", () => {
    const profile = buildLocationSearchProfile(base);

    expect(profile.primaryDomain).toBe("nightlife");
    expect(profile.nightlifeCategories).toContain("cigar_lounge");
    expect(profile.canonicalTerms).toContain("cigar lounge");
    expect(profile.audiences).not.toContain("family");
    expect(profile.confidence).toBeGreaterThanOrEqual(0.6);
    expect(profile.reviewReasons).not.toContain("low_confidence");
  });
});
