import { describe, expect, it } from "vitest";
import { extractRawRestaurantDishTerms } from "../rawDishTerms";
import type { SearchIntent } from "../types";

function restaurantIntent(foodTerms: string[] = ["steak"]): SearchIntent {
  return {
    rawQuery: "",
    searchType: "restaurant",
    primaryDomain: "restaurant",
    needsRestaurant: true,
    needsActivity: false,
    wantsPairing: false,
    restaurantIntent: {
      mealTerms: [],
      foodTerms,
      cuisineTerms: [],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
    },
    activityIntent: {
      activityTerms: [],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
    },
    geo: {
      raw: "Manhattan",
      city: "New York",
      state: "NY",
      county: "New York County",
      borough: "Manhattan",
      latitude: 40.7831,
      longitude: -73.9712,
      radiusMiles: 8,
      aliases: [],
      geoStrictness: "medium",
      resolvedMarket: "NYC_CORE",
      requestedMarket: "NYC_CORE",
    },
    occasion: null,
    vibe: [],
    strictness: "medium",
  } as SearchIntent;
}

describe("raw restaurant dish quality/ranking language", () => {
  it("does not turn highly rated language into dish constraints", () => {
    const terms = extractRawRestaurantDishTerms(
      "Plan a restaurant only. highly rated steak restaurant in nyc Location: New York. Return the best options, ranked by fit.",
      restaurantIntent(),
    );

    expect(terms).not.toContain("highly");
    expect(terms).not.toContain("rated");
    expect(terms).not.toContain("highly rated steak");
    expect(terms.some((term) => /highly|rated|rating|review|popular/.test(term))).toBe(false);
  });

  it.each([
    "highest rated sushi restaurant",
    "top rated seafood restaurant",
    "most popular ramen restaurant",
    "best reviewed italian restaurant",
    "steak restaurant with great reviews",
  ])("strips ranking language globally: %s", (query) => {
    const terms = extractRawRestaurantDishTerms(query, restaurantIntent([]));
    expect(terms.some((term) => /highest|rated|popular|reviewed|reviews|rating/.test(term))).toBe(false);
  });
});
