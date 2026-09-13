import { describe, expect, it } from "vitest";
import { extractRawRestaurantDishTerms } from "../rawDishTerms";
import type { SearchIntent } from "../types";

function intent(rawQuery: string, geoOverrides: Partial<SearchIntent["geo"]> = {}): SearchIntent {
  return {
    rawQuery,
    searchType: "restaurant",
    primaryDomain: "restaurant",
    needsRestaurant: true,
    needsActivity: false,
    wantsPairing: false,
    restaurantIntent: { mealTerms: [], foodTerms: ["steak", "lobster"], cuisineTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
    activityIntent: { activityTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
    geo: { raw: "New York", neighborhood: null, borough: "Manhattan", city: "New York", county: "New York County", region: null, state: "NY", requestedMarket: "NYC_CORE", resolvedMarket: "NYC_CORE", aliases: [], geoStrictness: "none", ...geoOverrides },
    occasion: null,
    vibe: [],
    strictness: "medium",
  };
}

describe("raw restaurant dish wrapper cleanup", () => {
  it("does not turn planner words or NYC aliases into food terms", () => {
    const query = "Plan a restaurant only. best steak and lobster in nyc Location: New York. When: 2026-09-12. Return the best options, ranked by fit.";
    const terms = extractRawRestaurantDishTerms(query, intent(query));
    expect(terms).not.toContain("only");
    expect(terms).not.toContain("nyc");
    expect(terms.some((term) => term.startsWith("only best"))).toBe(false);
    expect(terms).toContain("steak and lobster");
  });

  it("uses taxonomy aliases to keep neighborhood shorthand out of dishes", () => {
    const query = "highly rated ramen in lic";
    const terms = extractRawRestaurantDishTerms(query, intent(query, {
      raw: "Long Island City",
      neighborhood: "Long Island City",
      borough: "Queens",
      city: "New York",
      county: "Queens County",
    }));
    expect(terms).not.toContain("lic");
    expect(terms.some((term) => term.includes("lic"))).toBe(false);
  });

  it("uses taxonomy aliases to keep state shorthand out of dishes", () => {
    const query = "best sushi in nj";
    const terms = extractRawRestaurantDishTerms(query, intent(query, {
      raw: "New Jersey",
      neighborhood: null,
      borough: null,
      city: null,
      county: null,
      region: "Northern New Jersey",
      state: "NJ",
      requestedMarket: "NORTHERN_NJ",
      resolvedMarket: "NORTHERN_NJ",
    }));
    expect(terms).not.toContain("nj");
    expect(terms.some((term) => term.includes(" nj"))).toBe(false);
  });
});
