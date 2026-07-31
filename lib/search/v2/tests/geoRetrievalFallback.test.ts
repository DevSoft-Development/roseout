import { describe, expect, it, vi } from "vitest";
import { buildProfileRpcAttempts, retrieveProfileLocations } from "../retrieval/retrieveProfileLocations";
import { resolveFallback } from "../fallback/resolveFallback";

const request = {
  desiredRole: "restaurant",
  cuisines: ["sushi"],
  foods: [],
  categories: [],
  features: [],
  retrievalTerms: ["sushi"],
  eligibleStorageTypes: ["restaurant"],
  geo: {
    source: "explicit",
    market: "LONG_ISLAND",
    city: "Garden City",
    borough: null,
    neighborhood: "Garden City",
    county: "Nassau",
    state: "NY",
    latitude: null,
    longitude: null,
    radiusMiles: 8,
    strictness: "strict",
  },
} as any;

describe("profile geo hierarchy", () => {
  it("preserves city, county, and market when neighborhood is present", () => {
    const attempts = buildProfileRpcAttempts(request, 60, true);
    expect(attempts[0]).toMatchObject({
      p_neighborhood: "Garden City",
      p_city: "Garden City",
      p_county: "Nassau",
      p_market: "LONG_ISLAND",
    });
    expect(attempts).toContainEqual(expect.objectContaining({
      p_neighborhood: null,
      p_city: "Garden City",
      p_county: "Nassau",
      p_market: "LONG_ISLAND",
    }));
    expect(attempts).toContainEqual(expect.objectContaining({
      p_neighborhood: null,
      p_city: null,
      p_county: "Nassau",
      p_market: "LONG_ISLAND",
    }));
  });

  it("stops after the exact textual scope when broader geo is disabled", () => {
    const attempts = buildProfileRpcAttempts(request, 60, false);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].p_neighborhood).toBe("Garden City");
    expect(attempts[0].p_city).toBe("Garden City");
  });

  it("finds rows on the city fallback after an empty neighborhood attempt", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: "garden-city-sushi" }], error: null });
    const rows = await retrieveProfileLocations({ rpc } as any, request, 60, true);
    expect(rows).toEqual([{ id: "garden-city-sushi" }]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_neighborhood: null,
      p_city: "Garden City",
      p_county: "Nassau",
    });
  });
});

describe("empty retrieval classification", () => {
  it("does not mislabel zero retrieved candidates as a distance failure", async () => {
    const trace = { fallback: null } as any;
    const result = await resolveFallback({
      plan: {
        mode: "paired_outing",
        restaurant: { required: true },
        activity: { required: true },
        pairing: { required: true },
        fallback: { allowPartial: true, allowNearbyPair: true },
      } as any,
      scored: { restaurants: [], activities: [] },
      pairs: [],
      retrievedCount: 0,
      trace,
    });
    expect(result.reason).toBe("no_candidates_retrieved");
    expect(trace.fallback).toEqual({ used: true, reason: "no_candidates_retrieved" });
  });
});
