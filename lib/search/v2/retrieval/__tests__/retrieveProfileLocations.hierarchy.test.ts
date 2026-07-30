import { describe, expect, it } from "vitest";
import { buildProfileRpcParams } from "../retrieveProfileLocations";
import type { RetrievalRequest } from "../retrievalTypes";

function request(overrides: Partial<RetrievalRequest> = {}): RetrievalRequest {
  return {
    desiredRole: "restaurant",
    cuisines: [],
    foods: [],
    categories: [],
    features: [],
    retrievalTerms: ["restaurant", "chicken"],
    eligibleStorageTypes: ["restaurant"],
    geo: {
      market: "NYC + Long Island",
      state: "NY",
      county: "Queens County",
      borough: "Queens",
      city: "New York",
      neighborhood: "Astoria",
      latitude: null,
      longitude: null,
      radiusMiles: null,
    },
    ...overrides,
  } as RetrievalRequest;
}

describe("buildProfileRpcParams", () => {
  it("uses neighborhood without stacking broader geography", () => {
    const params = buildProfileRpcParams(request());
    expect(params.p_neighborhood).toBe("Astoria");
    expect(params.p_borough).toBeNull();
    expect(params.p_city).toBeNull();
    expect(params.p_county).toBeNull();
    expect(params.p_market).toBeNull();
    expect(params.p_state).toBe("NY");
  });

  it("uses coordinates as the authoritative geography scope", () => {
    const params = buildProfileRpcParams(request({
      geo: {
        ...request().geo,
        latitude: 40.7644,
        longitude: -73.9235,
        radiusMiles: 8,
      },
    }));
    expect(params.p_latitude).toBe(40.7644);
    expect(params.p_longitude).toBe(-73.9235);
    expect(params.p_radius_miles).toBe(8);
    expect(params.p_neighborhood).toBeNull();
    expect(params.p_borough).toBeNull();
    expect(params.p_city).toBeNull();
    expect(params.p_county).toBeNull();
    expect(params.p_market).toBeNull();
    expect(params.p_state).toBeNull();
  });

  it("falls back through borough, city, county, then a concrete market", () => {
    const borough = buildProfileRpcParams(request({ geo: { ...request().geo, neighborhood: null } }));
    expect(borough.p_borough).toBe("Queens");
    expect(borough.p_city).toBeNull();

    const city = buildProfileRpcParams(request({ geo: { ...request().geo, neighborhood: null, borough: null } }));
    expect(city.p_city).toBe("New York");
    expect(city.p_county).toBeNull();

    const county = buildProfileRpcParams(request({ geo: { ...request().geo, neighborhood: null, borough: null, city: null } }));
    expect(county.p_county).toBe("Queens County");
    expect(county.p_market).toBeNull();

    const market = buildProfileRpcParams(request({ geo: { ...request().geo, market: "NYC", neighborhood: null, borough: null, city: null, county: null } }));
    expect(market.p_market).toBe("NYC");
  });

  it("never sends the composite default market as an exact profile market", () => {
    for (const broadMarket of ["NYC_LONG_ISLAND", "NYC + LONG ISLAND", "NYC + Long Island"]) {
      const params = buildProfileRpcParams(request({ geo: { ...request().geo, market: broadMarket, neighborhood: null, borough: null, city: null, county: null } }));
      expect(params.p_market).toBeNull();
    }
  });

  it("uses category overlap inputs and avoids joining all synonyms into full text", () => {
    const params = buildProfileRpcParams(request({
      cuisines: ["italian"],
      foods: ["chicken"],
      categories: ["restaurant"],
      features: ["rooftop"],
      retrievalTerms: ["restaurant", "dining", "chicken restaurant"],
    }));
    expect(params.p_query).toBe("restaurant");
    expect(params.p_categories).toEqual(expect.arrayContaining(["italian", "chicken", "restaurant", "rooftop", "dining"]));
  });

  it("expands newly introduced food terms to established profile vocabulary", () => {
    const params = buildProfileRpcParams(request({
      foods: ["wings"],
      retrievalTerms: ["wings", "restaurant"],
    }));
    expect(params.p_categories).toEqual(expect.arrayContaining(["wings", "chicken", "fried chicken", "sports bar", "bar food"]));
  });
});