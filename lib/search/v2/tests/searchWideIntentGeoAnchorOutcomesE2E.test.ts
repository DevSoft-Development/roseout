import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { buildPublicSearchResponse } from "../response/buildPublicSearchResponse";
import { createSearchTrace } from "../observability/searchTrace";

async function plan(query: string) {
  return buildSearchPlan({ input: { query, requestId: `test:${query}` } as any });
}

function emptyResult(overrides: Record<string, unknown> = {}) {
  return {
    requestFulfilled: false,
    partialResults: false,
    resolvedMode: "paired_outing",
    restaurants: [],
    activities: [],
    sameVenueResults: [],
    pairs: [],
    builderRestaurants: [],
    builderActivities: [],
    retrievedCandidates: 0,
    used: false,
    reason: null,
    geoResolution: null,
    ...overrides,
  } as any;
}

describe("search-wide intent, geo, anchor, and outcome contracts", () => {
  it.each([
    "We want dinner near a museum in Manhattan before walking around.",
    "Find lunch close to a skating rink in Queens.",
    "Show restaurants around an aquarium in Brooklyn.",
  ])("treats generic nearby categories as anchors: %s", async (query) => {
    const result = await plan(query);
    expect(result.mode).toBe("anchored_nearby");
    expect(result.anchor.requested).toBe(true);
    expect(result.anchor.rawName).toBeTruthy();
    expect(result.activity.required).toBe(false);
    expect(result.geo.city).toBeNull();
    expect(result.geo.borough).toBeNull();
  });

  it.each([
    ["Plan dinner near a location called The Garden Room in Nassau County.", "the garden room"],
    ["Find food near a place named Blue Lantern in Queens.", "blue lantern"],
    ["Show lunch around a venue called North Hall in Brooklyn.", "north hall"],
  ])("extracts named anchors introduced by called or named: %s", async (query, expected) => {
    const result = await plan(query);
    expect(result.mode).toBe("anchored_nearby");
    expect(result.anchor.rawName).toBe(expected);
    expect(result.anchor.requested).toBe(true);
  });

  it.each([
    "Sushi followed by an interactive activity in Garden City.",
    "Dinner and something interactive afterward in Astoria.",
    "Italian food then a hands-on activity in Brooklyn.",
  ])("expands generic interactive activity intent: %s", async (query) => {
    const result = await plan(query);
    expect(result.activity.required).toBe(true);
    expect(result.activity.categories).toEqual(expect.arrayContaining(["escape_room", "arcade", "bowling"]));
  });

  it.each([
    "Halal dinner and karaoke afterward in Flushing.",
    "Seafood followed by a waterfront walk in Long Island City.",
    "Steak dinner and a relaxed lounge in Midtown.",
  ])("does not introduce theater without explicit theater language: %s", async (query) => {
    const result = await plan(query);
    expect(result.activity.categories).not.toContain("theater");
  });

  it.each([
    "Dinner and a movie theater afterward in Queens.",
    "Italian food followed by theatre in Manhattan.",
    "Lunch then a cinema nearby in Brooklyn.",
  ])("retains theater when explicitly requested: %s", async (query) => {
    const result = await plan(query);
    expect(result.activity.categories).toContain("theater");
  });

  it("uses coordinate-first canonical planning for Long Island localities", async () => {
    const result = await plan("Sushi and an escape room in Garden City.");
    expect(result.geo.market).toBe("LONG_ISLAND");
    expect(result.geo.latitude).not.toBeNull();
    expect(result.geo.longitude).not.toBeNull();
    expect(result.geo.city).toBeNull();
    expect(result.geo.county).toMatch(/Nassau/i);
  });

  it("classifies strict pair rejection evidence as expected constraint no-pair", async () => {
    const searchPlan = await plan("Halal dinner and karaoke under a 20 minute walk in Flushing.");
    const trace = createSearchTrace(searchPlan.requestId);
    trace.pairingDebug = {
      restaurantCandidates: 2,
      activityCandidates: 3,
      pairCandidatesEvaluated: 6,
      validPairCountBeforeRender: 0,
      validPairCountAfterConstraints: 0,
      validPairCountAfterDiversification: 0,
      renderEligiblePairCount: 0,
      finalEligiblePairs: [],
      eligibilityContractValid: true,
      eligibilityContractViolation: null,
      rejectionCounts: {
        distance_exceeded: 0,
        missing_coordinates: 0,
        market_mismatch: 0,
        walkability_constraint: 6,
        schedule_open_hours_conflict: 0,
        same_venue_constraint: 0,
        insufficient_domain_candidates: 0,
        other: 0,
      },
      rejectedPairs: [],
      primaryFailure: "walkability_constraint",
    };
    const response = buildPublicSearchResponse({ plan: searchPlan, result: emptyResult(), trace });
    expect(response.outcome).toBe("expected_constraint_no_pair");
    expect(response.success).toBe(false);
    expect(response.pairs).toHaveLength(0);
  });

  it.each(["clarification_required", "not_found", "missing_coordinates"] as const)("does not expose guessed results for unresolved anchors: %s", async (status) => {
    const searchPlan = await plan("Dinner near a museum in Manhattan.");
    const trace = createSearchTrace(searchPlan.requestId);
    trace.anchorResolution = {
      status,
      requested: true,
      rawName: "museum",
      resolvedLocationId: null,
      requiresClarification: status === "clarification_required",
      candidateCount: status === "clarification_required" ? 3 : 0,
      candidates: [],
      diagnostics: null,
    };
    const response = buildPublicSearchResponse({
      plan: searchPlan,
      result: emptyResult({
        requestFulfilled: true,
        partialResults: true,
        resolvedMode: "anchored_nearby",
      }),
      trace,
    });
    expect(response.success).toBe(false);
    expect(response.requestFulfilled).toBe(false);
    expect(response.displayMode).toBe("empty");
    expect(response.outcome).toBe(status === "clarification_required" ? "clarification_required" : "anchor_not_found");
  });

  it("does not mark restaurant-only partials successful when a pair was required", async () => {
    const searchPlan = await plan("Sushi dinner and an escape room afterward in Garden City.");
    const trace = createSearchTrace(searchPlan.requestId);
    const response = buildPublicSearchResponse({
      plan: searchPlan,
      result: emptyResult({ partialResults: true }),
      trace,
    });
    expect(searchPlan.pairing.required).toBe(true);
    expect(response.success).toBe(false);
  });
});
