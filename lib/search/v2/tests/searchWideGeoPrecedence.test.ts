import { describe, expect, it } from "vitest";
import { classifyCandidateGeo, mostSpecificRequestedGeoScope } from "../geo/geoPolicy";

function plan(geo: Record<string, unknown>) {
  return {
    geo: {
      source: "explicit",
      market: null,
      city: null,
      borough: null,
      neighborhood: null,
      county: null,
      state: "NY",
      latitude: 40.73,
      longitude: -73.895,
      radiusMiles: 3,
      strictness: "strict",
      ...geo,
    },
  } as any;
}

const location = (overrides: Record<string, unknown>) => ({
  id: "candidate",
  market: "NYC",
  city: "New York",
  borough: "Queens",
  county: "Queens County",
  neighborhood: "Flushing",
  state: "NY",
  latitude: 40.73,
  longitude: -73.895,
  ...overrides,
}) as any;

describe("search-wide geographic scope precedence", () => {
  it.each([
    [{ neighborhood: "Flushing", city: "New York", borough: "Queens", county: "Queens County", market: "NYC" }, "neighborhood"],
    [{ city: "New York", borough: "Queens", county: "Queens County", market: "NYC" }, "city"],
    [{ borough: "Queens", county: "Queens County", market: "NYC" }, "borough"],
    [{ county: "Queens County", market: "NYC" }, "county"],
    [{ market: "NYC" }, "market"],
  ])("chooses the most specific requested scope for %o", (geo, expected) => {
    expect(mostSpecificRequestedGeoScope(plan(geo))).toBe(expected);
  });

  it("does not downgrade a neighborhood request to a parent borough match", () => {
    const result = classifyCandidateGeo(
      plan({ neighborhood: "Flushing", city: "New York", borough: "Queens", county: "Queens County", market: "NYC" }),
      location({ neighborhood: "Astoria", latitude: 40.7579, longitude: -73.9202 }),
    );

    expect(result.tier).not.toBe("exact_locality");
    expect(result.scopeLevel).not.toBe("borough");
  });

  it("does not downgrade a city request to a parent county or market match", () => {
    const result = classifyCandidateGeo(
      plan({ city: "Huntington", county: "Suffolk County", market: "LONG_ISLAND" }),
      location({ city: "Patchogue", borough: null, county: "Suffolk County", market: "LONG_ISLAND", latitude: 40.7657, longitude: -73.0151 }),
    );

    expect(result.tier).not.toBe("exact_locality");
    expect(result.scopeLevel).not.toBe("county");
    expect(result.scopeLevel).not.toBe("market");
  });

  it("allows an exact borough match when borough is the most specific request", () => {
    const result = classifyCandidateGeo(
      plan({ borough: "Queens", county: "Queens County", market: "NYC" }),
      location({ neighborhood: "Astoria" }),
    );

    expect(result.tier).toBe("exact_locality");
    expect(result.scopeLevel).toBe("borough");
  });

  it("allows an exact county match when county is the most specific request", () => {
    const result = classifyCandidateGeo(
      plan({ county: "Nassau County", market: "LONG_ISLAND" }),
      location({ city: "Garden City", neighborhood: null, borough: null, county: "Nassau County", market: "LONG_ISLAND" }),
    );

    expect(result.tier).toBe("exact_locality");
    expect(result.scopeLevel).toBe("county");
  });
});
