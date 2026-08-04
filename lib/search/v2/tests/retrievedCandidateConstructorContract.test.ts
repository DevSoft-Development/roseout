import { describe, expect, it } from "vitest";
import { candidateFrom } from "../retrieval/retrieveCandidates";

const plan = {
  geo: {
    source: "explicit",
    market: "NYC",
    city: "New York",
    borough: "Queens",
    neighborhood: "Flushing",
    county: "Queens County",
    state: "NY",
    latitude: 40.73,
    longitude: -73.895,
    radiusMiles: 3,
    strictness: "strict",
  },
} as any;

const request = {
  desiredRole: "restaurant",
  cuisines: ["halal"],
  foods: [],
  categories: [],
  features: [],
  retrievalTerms: ["halal"],
  eligibleStorageTypes: [],
  geo: plan.geo,
} as any;

describe("retrieved candidate constructor contract", () => {
  it("always attaches geographic provenance", () => {
    const candidate = candidateFrom(
      {
        id: "flushing-halal",
        name: "Flushing Halal",
        location_type: "restaurant",
        neighborhood: "Flushing",
        city: "New York",
        borough: "Queens",
        county: "Queens County",
        state: "NY",
        latitude: 40.758,
        longitude: -73.83,
        distance_miles: 0.6,
      },
      request,
      "enterprise_search_profile_locations",
      plan,
      "neighborhood",
    );

    expect(candidate.geoMatch.tier).toBe("exact_locality");
    expect(candidate.geoMatch.accepted).toBe(true);
    expect(candidate.retrievalGeoLevel).toBe("neighborhood");
  });
});
