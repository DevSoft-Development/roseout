import { describe, expect, it } from "vitest";
import { evaluateReplayCase } from "@/app/api/admin/search-quality/replay/route";

function response(servedDomains: Array<"restaurant" | "activity">) {
  const restaurant = servedDomains.includes("restaurant") ? [{ id: "r1", primaryDomain: "restaurant" }] : [];
  const activity = servedDomains.includes("activity") ? [{ id: "a1", primaryDomain: "activity" }] : [];
  return {
    restaurants: restaurant,
    activities: activity,
    pairs: [],
    timing: { totalMs: 100 },
    retrieval: { legacyFallbackUsed: false, fallbackDomains: [] },
    debug: { retrievalCalls: [], decisions: [] },
  };
}

describe("strict replay domain purity", () => {
  it("fails an activity-only query when restaurant results are also returned", () => {
    const query = { expectations: { expectedDomains: ["activity"] } };
    const comparison = evaluateReplayCase(
      query,
      response(["activity"]),
      response(["restaurant", "activity"]),
      response(["restaurant", "activity"]),
    );

    expect(comparison.passed).toBe(false);
    expect(comparison.wrongDomain).toBe(true);
    expect(comparison.missingDomains).toEqual([]);
    expect(comparison.unexpectedDomains).toEqual(["restaurant"]);
  });

  it("keeps paired restaurant and activity queries valid", () => {
    const query = {
      expectations: {
        expectedDomains: ["restaurant", "activity"],
        minimumPairs: 0,
      },
    };
    const comparison = evaluateReplayCase(
      query,
      response(["restaurant", "activity"]),
      response(["restaurant", "activity"]),
      response(["restaurant", "activity"]),
    );

    expect(comparison.passed).toBe(true);
    expect(comparison.wrongDomain).toBe(false);
    expect(comparison.unexpectedDomains).toEqual([]);
  });

  it("does not enforce exact domains for production replay cases without expectations", () => {
    const query = { expectations: { expectedDomains: [] } };
    const comparison = evaluateReplayCase(
      query,
      response(["activity"]),
      response(["restaurant", "activity"]),
      response(["restaurant", "activity"]),
    );

    expect(comparison.wrongDomain).toBe(false);
    expect(comparison.unexpectedDomains).toEqual([]);
  });
});
