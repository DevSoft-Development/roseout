import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { candidateMatchesRequestedGeo, resolveCandidateGeo } from "../geo/geoBoundary";
import { retrieveUnifiedLocations } from "../retrieval/retrieveUnifiedLocations";
import type { RetrievalRequest } from "../retrieval/retrievalTypes";

const gardenCityGeo = {
  source: "explicit" as const,
  market: "LONG_ISLAND",
  city: "Garden City",
  borough: null,
  neighborhood: null,
  county: "Nassau County",
  state: "NY",
  latitude: 40.738,
  longitude: -73.682,
  radiusMiles: 6,
  strictness: "strict" as const,
};

const request: RetrievalRequest = {
  desiredRole: "restaurant",
  cuisines: ["sushi"],
  foods: [],
  categories: [],
  features: [],
  retrievalTerms: ["sushi"],
  eligibleStorageTypes: ["restaurant"],
  geo: gardenCityGeo,
};

describe("shared search geography boundary", () => {
  it("infers Nassau County from a supported Long Island city when county is missing", () => {
    const resolved = resolveCandidateGeo({ city: "Mineola", state: "NY" });
    expect(resolved.county).toBe("Nassau County");
    expect(candidateMatchesRequestedGeo(gardenCityGeo, { city: "Mineola", state: "NY" }).matches).toBe(true);
  });

  it("infers NYC borough counties and blocks them from Nassau searches", () => {
    const queens = resolveCandidateGeo({ city: "Flushing", borough: "Queens", state: "NY" });
    expect(queens.county).toBe("Queens County");
    expect(candidateMatchesRequestedGeo(gardenCityGeo, { city: "Flushing", borough: "Queens", state: "NY" })).toMatchObject({
      matches: false,
      reason: "county_mismatch",
    });
  });

  it("keeps coordinate containment subordinate to the requested county boundary", async () => {
    const rows = [
      {
        id: "nassau-sushi",
        location_type: "restaurant",
        name: "Mineola Sushi",
        city: "Mineola",
        state: "NY",
        county: null,
        latitude: 40.7493,
        longitude: -73.6407,
        cuisine: "sushi",
        search_keywords: ["sushi"],
      },
      {
        id: "queens-sushi",
        location_type: "restaurant",
        name: "Queens Sushi",
        city: "Flushing",
        borough: "Queens",
        state: "NY",
        county: null,
        latitude: 40.758,
        longitude: -73.833,
        cuisine: "sushi",
        search_keywords: ["sushi"],
      },
    ];
    const supabase = {
      rpc: async () => ({ data: rows, error: null }),
    } as unknown as SupabaseClient;

    const results = await retrieveUnifiedLocations(supabase, request, 20, undefined, {
      allowBroaderGeo: true,
      forcedGeoLevel: "market",
    });

    expect(results.map((location) => location.id)).toEqual(["nassau-sushi"]);
  });

  it("blocks cross-state candidates before pairing or fallback", () => {
    expect(candidateMatchesRequestedGeo(gardenCityGeo, { city: "Hoboken", state: "NJ", county: "Hudson County" })).toMatchObject({
      matches: false,
      reason: "state_mismatch",
    });
  });
});
