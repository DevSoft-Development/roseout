import { describe, expect, it, vi } from "vitest";
import { retrieveUnifiedLocations } from "../retrieval/retrieveUnifiedLocations";
import { classifyQaIssue, type QaSearchSummary } from "../../quality/qaSearchLog";

const request = {
  desiredRole: "restaurant",
  retrievalTerms: ["sushi"],
  categories: [], cuisines: ["sushi"], foods: [], features: [],
  geo: {
    source: "explicit", market: "LONG_ISLAND", city: "Garden City", borough: null,
    neighborhood: "Garden City", county: "Nassau", state: "NY",
    latitude: null, longitude: null, radiusMiles: 8, strictness: "strict",
  },
} as any;

function row(overrides: Record<string, unknown> = {}) {
  return { id: "1", location_type: "restaurant", city: "Garden City", neighborhood: null, county: "Nassau", state: "NY", market: "LONG_ISLAND", latitude: 40.72, longitude: -73.63, ...overrides };
}

describe("legacy geo fallback forced mode", () => {
  it("re-runs the RPC at city scope after exact neighborhood returns no retained rows", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [row({ city: "Hempstead", neighborhood: null })], error: null })
      .mockResolvedValueOnce({ data: [row()], error: null });
    const results = await retrieveUnifiedLocations({ rpc } as any, request, 60, undefined, { allowBroaderGeo: true });
    expect(results).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_neighborhood: null, p_city: "Garden City", p_county: "Nassau" });
  });

  it("does not widen legacy geography when allowBroaderGeo is false", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row({ city: "Hempstead" })], error: null });
    const results = await retrieveUnifiedLocations({ rpc } as any, request, 60, undefined, { allowBroaderGeo: false });
    expect(results).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("forced canonical and legacy QA contracts", () => {
  const partialPaired = (engine: "canonical" | "legacy"): QaSearchSummary => ({
    query: "Sushi and an escape room near Garden City for four people",
    ok: true,
    engine,
    normalized_search_type: "paired_outing",
    primary_domain: "mixed",
    restaurant_count: 8,
    activity_count: 0,
    pair_count: 0,
    result_count: 8,
    timing_ms: 500,
    speed_status: "fast",
    intentParserSource: "deterministic",
    no_results_reason: "partial_restaurants_only",
    no_pairs_reason: null,
    suspiciousFlags: [], warnings: [], errors: [], needsRestaurant: true, needsActivity: true,
  });

  it.each(["canonical", "legacy"] as const)("marks partial paired results unsuccessful in %s mode", (engine) => {
    const issue = classifyQaIssue(partialPaired(engine));
    expect(issue.type).toBe("missing_pair");
  });
});
