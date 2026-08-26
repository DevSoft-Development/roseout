import { describe, expect, it } from "vitest";
import { evaluateSearchAcceptanceContracts } from "./searchAcceptanceContracts";

describe("semantic QA truth regressions", () => {
  it("does not pass a restaurant-only request that claims fulfillment with zero renderable results", () => {
    const result = {
      query: "I want something quiet enough to talk and not crazy expensive",
      searchV2: {
        requestFulfilled: true,
        requestedMode: "restaurant_only",
        searchPlan: {
          mode: "restaurant_only",
          rawQuery: "I want something quiet enough to talk and not crazy expensive",
          restaurant: { required: false, cuisines: [], foods: [], features: [], exclusions: [] },
          activity: { required: false, categories: [], exclusions: [] },
          anchor: { requested: false },
        },
      },
    };

    const matrix = evaluateSearchAcceptanceContracts({
      result,
      counts: { restaurants: 0, activities: 0, pairs: 0, displayed: 0 },
      errors: [],
      warnings: [],
    });

    expect(matrix.intent.passed).toBe(false);
    expect(matrix.qa.evidence.hasRenderableResults).toBe(false);
    expect(matrix.testPassed).toBe(false);
  });

  it("fails QA when a positive activity term conflicts with an explicit exclusion", () => {
    const result = {
      query: "Sushi and something fun after, but not an arcade",
      searchV2: {
        requestFulfilled: true,
        requestedMode: "paired_outing",
        searchPlan: {
          mode: "paired_outing",
          rawQuery: "Sushi and something fun after, but not an arcade",
          restaurant: { required: true, cuisines: ["sushi"], foods: [], features: [], exclusions: [] },
          activity: { required: true, categories: ["arcade"], exclusions: ["arcade"] },
          relationship: { type: "sequential" },
          anchor: { requested: false },
        },
      },
    };

    const matrix = evaluateSearchAcceptanceContracts({
      result,
      counts: { restaurants: 2, activities: 2, pairs: 1, displayed: 1 },
      errors: [],
      warnings: [],
    });

    expect(matrix.intent.passed).toBe(false);
    expect(matrix.intent.evidence.activityExclusionConflicts).toEqual(["arcade"]);
    expect(matrix.testPassed).toBe(false);
  });

  it("fails QA when a same-venue-required request is rendered as a separate pair", () => {
    const result = {
      query: "Find somewhere in Brooklyn where we can eat, have drinks and listen to live music",
      searchV2: {
        requestFulfilled: true,
        requestedMode: "paired_outing",
        searchPlan: {
          mode: "paired_outing",
          rawQuery: "Find somewhere in Brooklyn where we can eat, have drinks and listen to live music",
          restaurant: { required: true, cuisines: [], foods: [], features: [], exclusions: [] },
          activity: { required: true, categories: ["live_music"], exclusions: [] },
          relationship: { type: "same_venue_required" },
          anchor: { requested: false },
        },
      },
    };

    const matrix = evaluateSearchAcceptanceContracts({
      result,
      counts: { restaurants: 3, activities: 3, pairs: 2, displayed: 2 },
      errors: [],
      warnings: [],
    });

    expect(matrix.intent.passed).toBe(false);
    expect(matrix.testPassed).toBe(false);
  });
});
