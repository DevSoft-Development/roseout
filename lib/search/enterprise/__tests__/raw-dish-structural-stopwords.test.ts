import { describe, expect, it } from "vitest";
import { extractRawRestaurantDishTerms } from "../rawDishTerms";
import type { SearchIntent } from "../types";

function mixedIntent(overrides: Partial<SearchIntent> = {}): SearchIntent {
  return {
    rawQuery: "",
    searchType: "mixed_outing",
    primaryDomain: "mixed",
    needsRestaurant: true,
    needsActivity: true,
    wantsPairing: true,
    strictness: "medium",
    restaurantIntent: {
      mealTerms: [],
      foodTerms: [],
      cuisineTerms: [],
      categoryTerms: ["restaurant"],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
    },
    activityIntent: {
      activityTerms: ["activity"],
      categoryTerms: ["activity"],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: ["bowling"],
    },
    geo: {
      raw: "Queens",
      city: "New York",
      state: "NY",
      county: "Queens County",
      borough: "Queens",
      neighborhood: null,
      region: null,
      latitude: 40.7282,
      longitude: -73.7949,
      radiusMiles: 10,
      geoStrictness: "medium",
      requestedMarket: "NYC_CORE",
      resolvedMarket: "NYC_CORE",
    },
    vibe: [],
    ...overrides,
  } as SearchIntent;
}

describe("raw dish structural stopwords", () => {
  it("does not turn a contrast connector into restaurant food intent", () => {
    const query = "restaurant and activity in Queens but no bowling";
    expect(extractRawRestaurantDishTerms(query, mixedIntent({ rawQuery: query }))).toEqual([]);
  });

  it("does not treat the dangling connector left after exclusion cleanup as a dish", () => {
    const query = "restaurant and activity in Queens but";
    expect(extractRawRestaurantDishTerms(query, mixedIntent({ rawQuery: query }))).toEqual([]);
  });

  it("still preserves a real authored dish next to mixed-search language", () => {
    const query = "lobster ravioli in Queens but no bowling";
    expect(extractRawRestaurantDishTerms(query, mixedIntent({ rawQuery: query }))).toEqual([
      "lobster ravioli",
      "lobster",
      "ravioli",
    ]);
  });
});
