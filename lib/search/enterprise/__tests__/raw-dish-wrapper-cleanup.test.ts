import { describe, expect, it } from "vitest";
import { extractRawRestaurantDishTerms } from "../rawDishTerms";
import type { SearchIntent } from "../types";

function intent(rawQuery: string): SearchIntent {
  return {
    rawQuery,
    searchType: "restaurant",
    primaryDomain: "restaurant",
    needsRestaurant: true,
    needsActivity: false,
    wantsPairing: false,
    restaurantIntent: { mealTerms: [], foodTerms: ["steak", "lobster"], cuisineTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
    activityIntent: { activityTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
    geo: { raw: "New York", neighborhood: null, borough: "Manhattan", city: "New York", county: "New York County", region: null, state: "NY", requestedMarket: "NYC_CORE", resolvedMarket: "NYC_CORE", aliases: [], geoStrictness: "none" },
    occasion: null,
    vibe: [],
    strictness: "medium",
  };
}

describe("raw restaurant dish wrapper cleanup", () => {
  it("does not turn planner words such as only/best into food terms", () => {
    const query = "Plan a restaurant only. best steak and lobster in nyc Location: New York. When: 2026-09-12. Return the best options, ranked by fit.";
    const terms = extractRawRestaurantDishTerms(query, intent(query));
    expect(terms).not.toContain("only");
    expect(terms.some((term) => term.startsWith("only best"))).toBe(false);
    expect(terms).toContain("steak and lobster");
  });
});
