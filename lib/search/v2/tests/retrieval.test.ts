import { describe, expect, it, vi } from "vitest";
import { retrieveCandidates } from "../retrieval/retrieveCandidates";
import { retrieveUnifiedLocations } from "../retrieval/retrieveUnifiedLocations";
import { createSearchTrace } from "../observability/searchTrace";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { RetrievalRequest } from "../retrieval/retrievalTypes";

const geo: SearchPlan["geo"] = {
  source: "explicit",
  market: "LONG_ISLAND",
  city: "Huntington",
  borough: null,
  neighborhood: null,
  county: "Suffolk County",
  state: "NY",
  latitude: 40.87,
  longitude: -73.43,
  radiusMiles: 12,
  strictness: "strict",
};

const request: RetrievalRequest = {
  desiredRole: "restaurant",
  cuisines: [],
  foods: [],
  categories: [],
  features: [],
  retrievalTerms: ["steak", "dinner", "steak"],
  eligibleStorageTypes: [],
  geo,
};

describe("Search Core V2 retrieval", () => {
  it("uses only the existing RPC contract and maps terms and coordinates", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "location-1" }], error: null });
    const rows = await retrieveUnifiedLocations({ rpc } as never, request, 25);

    expect(rows[0]?.id).toBe("location-1");
    expect(rpc).toHaveBeenCalledWith("enterprise_search_locations", {
      p_search_terms: ["steak", "dinner"],
      p_domain: "restaurant",
      p_neighborhood: null,
      p_borough: null,
      p_city: "Huntington",
      p_county: "Suffolk County",
      p_region: "Long Island",
      p_state: "NY",
      p_latitude: 40.87,
      p_longitude: -73.43,
      p_radius_miles: 12,
      p_limit: 25,
      p_allow_places_of_worship: false,
      p_allow_low_level: false,
    });
    const params = rpc.mock.calls[0][1];
    expect(params).not.toHaveProperty("p_terms");
    expect(params).not.toHaveProperty("p_market");
    expect(params).not.toHaveProperty("p_lat");
    expect(params).not.toHaveProperty("p_lng");
    expect(params).not.toHaveProperty("p_require_photos");
    expect(params).not.toHaveProperty("p_strict_geo");
  });

  it("preserves location IDs while merging candidates from retrieval lanes", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "existing-id", name: "Venue" }], error: null });
    const plan = {
      version: "search-plan-v1",
      requestId: "request-1",
      mode: "restaurant_only",
      restaurant: { required: true, cuisines: [], foods: ["steak"], mealPeriods: [], features: [], exclusions: [] },
      activity: { required: false, categories: [], features: [], exclusions: [] },
      geo,
      anchor: { requested: false, rawName: null, locationId: null, name: null, latitude: null, longitude: null },
      pairing: { required: false, sameVenuePreferred: false, sameVenueRequired: false, sequence: "any", maxDistanceMiles: null, maxWalkingMinutes: null, requireWalkable: false },
      audience: { familyFriendly: false, minorsPresent: false, adultOnlyRequested: false },
      occasion: null,
      partySize: null,
      plannedFor: null,
      fallback: { allowNearbyPair: true, allowPartial: true, allowBroaderGeo: true, maximumRadiusMiles: null },
      confidence: { overall: 1, mode: 1, restaurant: 1, activity: 1, geo: 1 },
      parser: { source: "deterministic", reasons: [] },
    } satisfies SearchPlan;

    const result = await retrieveCandidates({
      plan,
      supabase: { rpc } as never,
      trace: createSearchTrace("request-1"),
    });
    expect(result.candidates[0]?.location.id).toBe("existing-id");
  });

  it("raises the stable retrieval code without changing the RPC error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "signature mismatch" } });
    await expect(retrieveUnifiedLocations({ rpc } as never, request)).rejects.toThrow(
      "SEARCH_V2_RETRIEVAL_FAILED",
    );
  });
});
