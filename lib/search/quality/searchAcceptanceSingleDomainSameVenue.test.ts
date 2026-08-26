import { describe, expect, it } from "vitest";
import { evaluateSearchAcceptanceContracts } from "./searchAcceptanceContracts";

function resultFor(query: string) {
  return {
    query,
    success: true,
    requestFulfilled: true,
    searchV2: {
      requestedMode: "restaurant_only",
      outcome: null,
      searchPlan: {
        rawQuery: query,
        mode: "restaurant_only",
        restaurant: { required: true, cuisines: ["seafood"], foods: [], features: ["rooftop"], exclusions: [] },
        activity: { required: false, categories: [], features: [], exclusions: [] },
        pairing: { required: false },
        anchor: { requested: false, entityType: "none" },
        relationship: { type: "same_venue_required" },
      },
      debug: {},
    },
    debug: {
      normalizedIntent: {
        searchType: "restaurant_only",
        needsRestaurant: true,
        needsActivity: false,
        relationship: { type: "same_venue_required" },
      },
    },
  };
}

describe("search acceptance single-domain same-venue features", () => {
  it.each([
    "seafood rooftop restaurant in Brooklyn",
    "seafood rooftop restaurant in Queens",
    "seafood rooftop restaurant in Astoria",
  ])("does not require mixed same-venue rendering for %s", (query) => {
    const contracts = evaluateSearchAcceptanceContracts({
      result: resultFor(query),
      errors: [],
      warnings: [],
      counts: { restaurants: 20, activities: 0, pairs: 0, displayed: 20 },
    });

    expect(contracts.intent.passed).toBe(true);
    expect(contracts.intent.reason).not.toContain("same-venue-required request");
    expect(contracts.testPassed).toBe(true);
  });
});
