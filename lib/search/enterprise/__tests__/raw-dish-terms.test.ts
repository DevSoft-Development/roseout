import { describe, expect, it } from "vitest";
import { createCandidateSearchRequest } from "@/lib/search/contracts/candidateSearch";
import { restaurantSearchTerms } from "../normalize-intent";
import {
  extractRawRestaurantDishTerms,
  preserveRawRestaurantDishTerms,
} from "../rawDishTerms";
import type { SearchIntent } from "../types";

function intent(overrides: Partial<SearchIntent> = {}): SearchIntent {
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
      foodTerms: ["seafood"],
      cuisineTerms: ["seafood"],
      categoryTerms: ["restaurant"],
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

describe("search-wide raw dish term preservation", () => {
  it("recovers a specific dish from the public create-search wrapper", () => {
    const query =
      "Plan a restaurant and activity outing. lobster ravioli in Queens Location: Queens. When: 2026-08-27. Return the best options, ranked by fit.";
    const parsed = intent({ rawQuery: query });

    expect(extractRawRestaurantDishTerms(query, parsed)).toEqual(["lobster ravioli"]);
  });

  it("preserves vocabulary that is not hardcoded in the restaurant taxonomy", () => {
    const query = "cacio e pepe and bowling in Brooklyn";
    const parsed = intent({
      rawQuery: query,
      restaurantIntent: {
        mealTerms: [],
        foodTerms: [],
        cuisineTerms: ["italian"],
        categoryTerms: ["restaurant"],
        vibeTerms: [],
        featureTerms: [],
        negativeTerms: [],
      },
      activityIntent: {
        activityTerms: ["bowling"],
        categoryTerms: ["bowling"],
        vibeTerms: [],
        featureTerms: [],
        negativeTerms: [],
      },
      geo: {
        ...intent().geo,
        raw: "Brooklyn",
        borough: "Brooklyn",
      },
    } as Partial<SearchIntent>);

    expect(extractRawRestaurantDishTerms(query, parsed)).toEqual(["cacio e pepe"]);
  });

  it("does not invent a dish term for ordinary occasion searches", () => {
    const query = "romantic date night in Brooklyn";
    const parsed = intent({
      rawQuery: query,
      occasion: "date night",
      restaurantIntent: {
        mealTerms: [],
        foodTerms: [],
        cuisineTerms: [],
        categoryTerms: ["restaurant"],
        vibeTerms: ["romantic"],
        featureTerms: [],
        negativeTerms: [],
      },
      geo: {
        ...intent().geo,
        raw: "Brooklyn",
        borough: "Brooklyn",
      },
    } as Partial<SearchIntent>);

    expect(extractRawRestaurantDishTerms(query, parsed)).toEqual([]);
  });

  it("puts the recovered dish into the existing RPC restaurant term list", () => {
    const query = "birria ramen in Queens";
    const parsed = intent({
      rawQuery: query,
      needsActivity: false,
      wantsPairing: false,
      primaryDomain: "restaurant",
      searchType: "restaurant",
      restaurantIntent: {
        mealTerms: [],
        foodTerms: [],
        cuisineTerms: [],
        categoryTerms: ["restaurant"],
        vibeTerms: [],
        featureTerms: [],
        negativeTerms: [],
      },
    } as Partial<SearchIntent>);

    preserveRawRestaurantDishTerms(query, parsed);
    expect(parsed.restaurantIntent.foodTerms).toContain("birria ramen");
    expect(restaurantSearchTerms(parsed)).toContain("birria ramen");
  });

  it("preserves the phrase through the shared candidate-search contract and live intent", () => {
    const query =
      "Plan a restaurant and activity outing. oxtail mac and cheese in Queens Location: Queens. When: 2026-08-27. Return the best options, ranked by fit.";
    const parsed = intent({ rawQuery: query });

    const request = createCandidateSearchRequest({
      requestId: "dish-preservation-test",
      query,
      intent: parsed,
      restaurantLimit: 20,
      activityLimit: 20,
    });

    expect(request.intent.restaurantIntent.foodTerms).toContain("oxtail mac and cheese");
    expect(parsed.restaurantIntent.foodTerms).toContain("oxtail mac and cheese");
  });
});
