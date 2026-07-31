import { describe, expect, it } from "vitest";
import { buildLegacyGeoLevels, retrieveUnifiedLocations } from "../retrieval/retrieveUnifiedLocations";

const request = (overrides: any = {}) => ({
  desiredRole: "restaurant",
  retrievalTerms: ["sushi"], categories: [], cuisines: ["sushi"], foods: [], features: [],
  geo: { neighborhood: null, city: "Garden City", borough: null, county: "Nassau County", market: "LONG_ISLAND", region: "Long Island", state: "NY", latitude: 40.73, longitude: -73.63, radiusMiles: 6, strictness: "strict", ...overrides },
});

describe("bounded paired geo fallback", () => {
  it("never adds statewide fallback for an explicit local search", () => {
    expect(buildLegacyGeoLevels(request() as any, true)).toEqual(["exact_neighborhood", "city", "borough_or_county", "market"]);
  });

  it("keeps strict mode at the exact scope", () => {
    expect(buildLegacyGeoLevels(request() as any, false)).toEqual(["exact_neighborhood"]);
  });

  it("rejects Manhattan candidates after widening a Garden City search", async () => {
    const rpc = async () => ({ data: [{ id: "manhattan", city: "New York", borough: "Manhattan", state: "NY", latitude: 40.739, longitude: -73.989, distance_miles: 18.5 }], error: null });
    const rows = await retrieveUnifiedLocations({ rpc } as any, request() as any, 60, undefined, { allowBroaderGeo: true });
    expect(rows).toEqual([]);
  });

  it("records the successful shared geo level on retained rows", async () => {
    const rpc = async (_name: string, params: any) => ({ data: params.p_city === "Garden City" ? [{ id: "local", city: "Garden City", county: "Nassau County", state: "NY", latitude: 40.73, longitude: -73.63, distance_miles: 1.2 }] : [], error: null });
    const rows = await retrieveUnifiedLocations({ rpc } as any, request() as any, 60, undefined, { allowBroaderGeo: true });
    expect((rows[0] as any).retrieval_geo_level).toBe("exact_neighborhood");
  });
});
