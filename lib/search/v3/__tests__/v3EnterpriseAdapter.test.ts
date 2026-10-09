import { describe, expect, it } from "vitest";
import { createEmptyLocationIntelligenceProfile } from "@/lib/search-framework/contracts/locationIntelligence";
import type { SearchV3Execution } from "@/lib/search-framework";
import { adaptV3ExecutionToEnterpriseResult } from "../response/v3EnterpriseAdapter";

function fixture(): SearchV3Execution {
  const restaurant = createEmptyLocationIntelligenceProfile({
    locationId: "r1", name: "A Restaurant", primaryDomain: "restaurant",
  });
  const activity = createEmptyLocationIntelligenceProfile({
    locationId: "a1", name: "An Activity", primaryDomain: "activity",
  });
  const r = {
    locationId: "r1", intelligence: restaurant, retrieval: [],
    frameworkScore: 1, finalRank: 1, metadata: {},
  };
  const a = {
    locationId: "a1", intelligence: activity, retrieval: [],
    frameworkScore: 1, finalRank: 2, metadata: {},
  };
  return {
    requestId: "test", query: "dinner and activity",
    intent: { domains: ["restaurant", "activity"], primaryDomain: "restaurant" },
    candidates: [r, a],
    outings: [{
      outingId: "r1:a1", restaurant: r, activity: a,
      score: 1, distanceMiles: 0.4, travelMinutes: 8,
      travelMode: "walking", sequence: "restaurant_then_activity",
      reasons: ["Close by"], metadata: {
        routeSource: "mapbox", routeConfidence: "verified",
        routeDistanceMiles: 0.4, withinTravelLimit: true,
      },
    }],
    metadata: { orchestrationVersion: "test", retrievalFailureCount: 0 },
  } as unknown as SearchV3Execution;
}

function db(rows: Array<{ id: string; name: string }>) {
  return {
    from: (_table: string) => ({
      select: (_columns: string) => ({
        in: async () => ({ data: rows, error: null }),
      }),
    }),
  };
}

describe("V3 public response adapter", () => {
  it("hydrates ranked locations and verified outing pairs", async () => {
    const result = await adaptV3ExecutionToEnterpriseResult(fixture(), db([
      { id: "r1", name: "A Restaurant" }, { id: "a1", name: "An Activity" },
    ]));
    expect(result.render_mode).toBe("mixed_pairs");
    expect(result.restaurants).toHaveLength(1);
    expect(result.activities).toHaveLength(1);
    expect(result.pairs[0].walkingRouteConfidence).toBe("verified");
    expect(result.pairs[0].isWalkable).toBe(true);
    expect(result.card_counts.pairs).toBe(1);
  });

  it("rejects partial location hydration so serving falls back to V2", async () => {
    await expect(adaptV3ExecutionToEnterpriseResult(fixture(), db([
      { id: "r1", name: "A Restaurant" },
    ]))).rejects.toThrow("v3_location_hydration_incomplete");
  });

  it("rejects missing required pairs", async () => {
    const execution = { ...fixture(), outings: [] };
    await expect(adaptV3ExecutionToEnterpriseResult(execution, db([
      { id: "r1", name: "A Restaurant" }, { id: "a1", name: "An Activity" },
    ]))).rejects.toThrow("v3_required_pairs_missing");
  });
});
