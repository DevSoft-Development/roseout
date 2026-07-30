import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";
import { canonicalTaxonomy } from "@/lib/search/v2/taxonomy";
import { buildSearchPlan } from "@/lib/search/v2/planner/buildSearchPlan";
import { buildRetrievalRequests } from "@/lib/search/v2/retrieval/buildRetrievalRequests";

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
  it("keeps restaurant-primary hookah venues searchable for meals and hookah", () => {
    const profile = buildLocationSearchProfile({
      ...base,
      id: "hookah-restaurant-1",
      name: "Mira Mediterranean & Hookah Lounge",
      locationType: "restaurant",
      restaurantName: "Mira Mediterranean & Hookah Lounge",
      activityType: "hookah",
      primaryCategory: "mediterranean",
      categories: ["restaurant", "hookah", "lounge"],
      description: "Mediterranean brunch, lunch, dinner and hookah service.",
    });

    expect(profile.primaryDomain).toBe("restaurant");
    expect(profile.supportedDomains).toEqual(expect.arrayContaining(["restaurant", "activity"]));
    expect(profile.activityCategories).toContain("hookah");
    expect(profile.nightlifeCategories).not.toContain("hookah");
    expect(profile.canonicalTerms).toEqual(expect.arrayContaining(["hookah", "hookah restaurant", "hookah cafe", "shisha lounge"]));
  });

  it("classifies standalone hookah venues as activity-primary instead of nightlife-only", () => {
    const profile = buildLocationSearchProfile({
      ...base,
      id: "hookah-activity-1",
      name: "Sheba Hookah Lounge",
      activityType: "hookah",
      primaryCategory: "hookah",
      categories: ["hookah", "lounge"],
    });

    expect(profile.primaryDomain).toBe("activity");
    expect(profile.supportedDomains).toContain("activity");
    expect(profile.activityCategories).toContain("hookah");
  });

  it.each([
    ["Hookah brunch in Queens", "brunch"],
    ["Hookah lunch in Brooklyn", "lunch"],
    ["Hookah restaurant in Manhattan", null],
  ])("plans %s as a same-venue restaurant plus hookah search", async (query, mealPeriod) => {
    const plan = await buildSearchPlan({ input: { query } });
    const requests = buildRetrievalRequests(plan);

    expect(plan.mode).toBe("same_venue");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.activity.categories).toContain("hookah");
    if (mealPeriod) expect(plan.restaurant.mealPeriods).toContain(mealPeriod);
    expect(requests.some((request) => request.desiredRole === "restaurant")).toBe(true);
    expect(requests.some((request) => request.desiredRole === "hookah_activity" && request.retrievalTerms.includes("hookah"))).toBe(true);
  });

  it("plans dinner and hookah after as an exact paired activity lane", async () => {
    const plan = await buildSearchPlan({ input: { query: "Steak dinner and a hookah lounge after in Queens" } });
    const requests = buildRetrievalRequests(plan);

    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.activity.categories).toContain("hookah");
    expect(plan.pairing.required).toBe(true);
    expect(requests.some((request) => request.desiredRole === "restaurant")).toBe(true);
    expect(requests.some((request) => request.desiredRole === "hookah_activity" && request.retrievalTerms.includes("hookah"))).toBe(true);
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

  it("keeps hookah adult-only while exposing the exact hookah activity role", () => {
    const hookah = canonicalTaxonomy.find((entry) => entry.id === "hookah");
    expect(hookah?.domain).toBe("activity");
    expect(hookah?.eligibleRoles).toContain("hookah_activity");
    expect(hookah?.audienceRestrictions).toContain("adult_only");
    expect(hookah?.aliases).toEqual(expect.arrayContaining(["hookah lounge", "hookah restaurant", "hookah cafe", "shisha", "hookah bar"]));
  });
});
