import { describe, expect, it } from "vitest";
import { GOLDEN_SEARCH_QUERIES } from "./goldenQueries";
import { buildSearchPlan } from "../v2/planner/buildSearchPlan";
import { nearbyPairDistanceMiles } from "../v2/pairing/nearbyPairPolicy";

describe("final supported-query gap", () => {
  it("keeps the exact failed Garden City query in the permanent golden suite", () => {
    const testCase = GOLDEN_SEARCH_QUERIES.find((item) => item.id === "pair-garden-city-escape");
    expect(testCase?.query).toBe("Sushi and an escape room in Garden City");
    expect(testCase?.expectations.minimumPairs).toBe(1);
    expect(testCase?.expectations.expectedDomains).toEqual(["restaurant", "activity"]);
  });

  it("allows a bounded six-mile nearby fallback for the Garden City query", async () => {
    const plan = await buildSearchPlan({ input: { query: "Sushi and an escape room in Garden City" } });
    expect(plan.geo.city).toBe("Garden City");
    expect(plan.geo.radiusMiles).toBe(6);
    expect(plan.pairing.maxDistanceMiles).toBe(3);
    expect(plan.fallback.allowNearbyPair).toBe(true);
    expect(nearbyPairDistanceMiles(plan)).toBe(6);
  });

  it("never relaxes explicit walking constraints", async () => {
    const plan = await buildSearchPlan({ input: { query: "Sushi and an escape room in Garden City within a 20-minute walk" } });
    expect(plan.pairing.requireWalkable).toBe(true);
    expect(nearbyPairDistanceMiles(plan)).toBeNull();
  });
});
