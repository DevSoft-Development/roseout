import { describe, expect, it, vi } from "vitest";
import { retrieveUnifiedLocations } from "../retrieval/retrieveUnifiedLocations";

function request() {
  return {
    desiredRole: "restaurant" as const,
    retrievalTerms: ["sushi", "omakase"],
    eligibleStorageTypes: ["restaurant"],
    geo: {
      source: "explicit" as const,
      market: "NYC",
      city: "New York",
      borough: "Queens",
      neighborhood: "Flushing",
      county: "Queens",
      state: "NY",
      latitude: 40.7675,
      longitude: -73.8331,
      radiusMiles: 5,
      strictness: "strict" as const,
    },
  };
}

describe("retrieveUnifiedLocations RPC contract", () => {
  it("uses the deployed enterprise_search_locations argument names", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await retrieveUnifiedLocations({ rpc } as never, request());

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, params] = rpc.mock.calls[0];
    expect(name).toBe("enterprise_search_locations");
    expect(params).toMatchObject({
      p_search_terms: ["sushi", "omakase"],
      p_domain: "restaurant",
      p_neighborhood: "Flushing",
      p_borough: "Queens",
      p_city: "New York",
      p_county: "Queens",
      p_state: "NY",
      p_latitude: 40.7675,
      p_longitude: -73.8331,
      p_radius_miles: 5,
      p_allow_places_of_worship: false,
      p_allow_low_level: false,
    });
    expect(params).not.toHaveProperty("p_terms");
    expect(params).not.toHaveProperty("p_market");
    expect(params).not.toHaveProperty("p_lat");
    expect(params).not.toHaveProperty("p_lng");
    expect(params).not.toHaveProperty("p_require_photos");
    expect(params).not.toHaveProperty("p_strict_geo");
  });
});
