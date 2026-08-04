import { describe, expect, it } from "vitest";
import { buildPublicSearchResponse } from "../response/buildPublicSearchResponse";

function mixedPlan() {
  return {
    requestId: "mixed-zero-pair-contract",
    mode: "paired_outing",
    restaurant: { required: true },
    activity: { required: true },
    anchor: { requested: false, name: null, rawName: null, locationId: null, latitude: null, longitude: null },
    geo: { city: "Bayside", borough: "Queens", state: "NY" },
  } as any;
}

function trace() {
  return {
    retrieval: {},
    timing: {},
    ml: {
      enabled: false,
      phase1Enabled: false,
      phase2Enabled: false,
      modelVersion: null,
      rankingVariant: null,
      rolloutBucket: null,
    },
  } as any;
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    restaurants: [],
    activities: [],
    sameVenueResults: [],
    pairs: [],
    builderRestaurants: [],
    builderActivities: [],
    requestFulfilled: false,
    partialResults: true,
    resolvedMode: "partial_mixed",
    used: false,
    reason: "no_pairs_within_distance",
    ...overrides,
  } as any;
}

describe("mixed zero-pair public response contract", () => {
  it("does not report success when a required mixed search has candidates but no pair", () => {
    const response = buildPublicSearchResponse({
      plan: mixedPlan(),
      result: result(),
      trace: trace(),
    });

    expect(response.displayMode).toBe("partial_mixed");
    expect(response.requestFulfilled).toBe(false);
    expect(response.partialResults).toBe(true);
    expect(response.success).toBe(false);
  });

  it("still reports success when the mixed request is actually fulfilled", () => {
    const response = buildPublicSearchResponse({
      plan: mixedPlan(),
      result: result({ requestFulfilled: true, partialResults: false }),
      trace: trace(),
    });

    expect(response.success).toBe(true);
  });

  it("does not change partial-result success for a single-domain request", () => {
    const plan = mixedPlan();
    plan.activity.required = false;

    const response = buildPublicSearchResponse({
      plan,
      result: result(),
      trace: trace(),
    });

    expect(response.success).toBe(true);
  });
});
