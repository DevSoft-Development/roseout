import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";
import { canonicalTaxonomy } from "@/lib/search/v2/taxonomy";

const base = {
  id: "location-1",
  name: "Test Venue",
  restaurantName: null,
  activityName: null,
  locationType: "activity",
  activityType: null,
  primaryCategory: null,
  categories: [],
  cuisines: [],
  foodTerms: [],
  features: [],
  description: null,
  address: null,
  market: "NYC",
  city: "New York",
  neighborhood: null,
  borough: "Queens",
  county: null,
  state: "NY",
  latitude: 40.75,
  longitude: -73.9,
  active: true,
  searchable: true,
  hidden: false,
  isLowLevel: false,
} as const;

describe("targeted canonical profile gap recovery", () => {
  it("classifies hookah and shisha lounges as explicit nightlife", () => {
    const profile = buildLocationSearchProfile({
      ...base,
      id: "hookah-1",
      name: "Cloud Nine Shisha Lounge",
      locationType: "restaurant",
      restaurantName: "Cloud Nine Shisha Lounge",
      primaryCategory: "hookah lounge",
      categories: ["hookah bar"],
      description: "Late-night hookah and shisha lounge with food.",
    });

    expect(profile.primaryDomain).toBe("restaurant");
    expect(profile.supportedDomains).toContain("nightlife");
    expect(profile.nightlifeCategories).toContain("hookah");
    expect(profile.canonicalTerms).toEqual(expect.arrayContaining(["hookah", "hookah lounge", "shisha lounge"]));
  });

  it.each([
    ["Fine Art Exhibition", "gallery"],
    ["Private Singing Room", "karaoke"],
    ["Neighborhood Movie Theatre", "movie"],
    ["Immersive Escape Game", "escape_room"],
    ["Indoor Miniature Golf", "mini_golf"],
    ["Family Entertainment Center", "indoor_playground"],
  ])("recovers %s into %s", (name, expectedCategory) => {
    const profile = buildLocationSearchProfile({ ...base, id: expectedCategory, name });
    expect(profile.activityCategories).toContain(expectedCategory);
    expect(profile.supportedDomains).toContain("activity");
  });

  it("keeps hookah as an adult-only nightlife taxonomy entry", () => {
    const hookah = canonicalTaxonomy.find((entry) => entry.id === "hookah");
    expect(hookah?.domain).toBe("nightlife");
    expect(hookah?.audienceRestrictions).toContain("adult_only");
    expect(hookah?.aliases).toEqual(expect.arrayContaining(["hookah lounge", "shisha", "hookah bar"]));
  });
});
