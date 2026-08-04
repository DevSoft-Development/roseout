import { describe, expect, it } from "vitest";
import { candidateMatchesRequestedGeo } from "../geo/geoBoundary";
import { buildGeoPredicateDiagnostics, resolveCanonicalLocality, sameLocalityValue } from "../geo/localityResolver";
import { buildPairs } from "../pairing/buildPairs";

function location(overrides: Record<string, unknown>) {
  return {
    id: String(overrides.id ?? "location"),
    name: String(overrides.name ?? "Location"),
    state: "NY",
    latitude: 40.75,
    longitude: -73.9,
    ...overrides,
  } as any;
}

function scored(overrides: Record<string, unknown>) {
  return {
    candidate: { candidate: { location: location(overrides) } },
    scores: { total: 90, quality: 90 },
  } as any;
}

function pairedPlan(overrides: Record<string, unknown> = {}) {
  return {
    version: "search-plan-v1",
    requestId: "locality-regression",
    rawQuery: "dinner and an activity",
    mode: "paired_outing",
    restaurant: { required: true, cuisines: [], foods: [], mealPeriods: [], features: [], exclusions: [] },
    activity: { required: true, categories: [], features: [], exclusions: [] },
    geo: {
      source: "explicit",
      market: "Long Island",
      city: "Garden City",
      borough: null,
      neighborhood: null,
      county: "Nassau County",
      state: "NY",
      latitude: 40.7268,
      longitude: -73.6343,
      radiusMiles: 6,
      strictness: "preferred",
    },
    anchor: { requested: false, rawName: null, locationId: null, name: null, latitude: null, longitude: null },
    travel: { mode: "walking", constraint: "hard", explicit: true },
    pairing: { required: true, sameVenuePreferred: false, sameVenueRequired: false, sequence: "restaurant_first", maxDistanceMiles: null, maxWalkingMinutes: 30, requireWalkable: true },
    audience: { familyFriendly: false, minorsPresent: false, adultOnlyRequested: false },
    occasion: null,
    partySize: null,
    plannedFor: null,
    fallback: { allowNearbyPair: true, allowPartial: false, allowBroaderGeo: true, maximumRadiusMiles: 20 },
    confidence: { overall: 1, mode: 1, restaurant: 1, activity: 1, geo: 1 },
    parser: { source: "deterministic", reasons: [] },
    ...overrides,
  } as any;
}

describe("canonical NYC and Long Island locality resolution", () => {
  it.each([
    ["Garden City", "LONG_ISLAND", "Nassau County"],
    ["Flushing", "NYC", "Queens County"],
    ["Midtown", "NYC", "New York County"],
    ["Astoria", "NYC", "Queens County"],
    ["Brooklyn", "NYC", "Kings County"],
    ["Nassau County", "LONG_ISLAND", "Nassau County"],
    ["Suffolk County", "LONG_ISLAND", "Suffolk County"],
  ])("resolves %s with coordinates and hierarchy", (name, market, county) => {
    const resolved = resolveCanonicalLocality({ city: name, state: "NY" });
    expect(resolved.canonicalName).toBeTruthy();
    expect(resolved.latitude).not.toBeNull();
    expect(resolved.longitude).not.toBeNull();
    expect(resolved.market).toBe(market);
    expect(resolved.county).toBe(county);
  });

  it("normalizes common aliases", () => {
    expect(sameLocalityValue("NYC", "New York City")).toBe(true);
    expect(sameLocalityValue("Kings County", "Brooklyn")).toBe(true);
    expect(sameLocalityValue("Village of Garden City", "Garden City")).toBe(true);
  });
});

describe("coordinate-first requested-area acceptance", () => {
  it("accepts a nearby Nassau candidate even when the city string differs", () => {
    const result = candidateMatchesRequestedGeo(
      {
        city: "Garden City",
        county: "Nassau County",
        market: "Long Island",
        state: "NY",
        latitude: 40.7268,
        longitude: -73.6343,
        radiusMiles: 6,
      },
      location({ city: "Westbury", county: "Nassau County", market: "Long Island", latitude: 40.7557, longitude: -73.5876 }),
    );
    expect(result.matches).toBe(true);
    expect(result.reason).toBe("inside_requested_radius");
  });

  it("accepts Midtown candidates labeled New York or Manhattan when coordinates fit", () => {
    const result = candidateMatchesRequestedGeo(
      { neighborhood: "Midtown", borough: "Manhattan", state: "NY", latitude: 40.7549, longitude: -73.984, radiusMiles: 3 },
      location({ city: "New York", borough: "Manhattan", county: "New York County", latitude: 40.758, longitude: -73.9855 }),
    );
    expect(result.matches).toBe(true);
    expect(result.reason).toBe("inside_requested_radius");
  });

  it("accepts Flushing candidates labeled Queens when coordinates fit", () => {
    const result = candidateMatchesRequestedGeo(
      { neighborhood: "Flushing", borough: "Queens", state: "NY", latitude: 40.7675, longitude: -73.8331, radiusMiles: 3 },
      location({ city: "Queens", borough: "Queens", county: "Queens County", latitude: 40.765, longitude: -73.831 }),
    );
    expect(result.matches).toBe(true);
  });

  it("rejects a true NYC to Long Island cross-market candidate", () => {
    const result = candidateMatchesRequestedGeo(
      { city: "Garden City", county: "Nassau County", market: "Long Island", state: "NY", latitude: 40.7268, longitude: -73.6343, radiusMiles: 6 },
      location({ city: "Brooklyn", borough: "Brooklyn", county: "Kings County", market: "NYC", latitude: 40.6782, longitude: -73.9442 }),
    );
    expect(result.matches).toBe(false);
    expect(result.reason).toBe("market_mismatch");
  });
});

describe("requested-area radius and pair walking distance", () => {
  it("keeps locality acceptance separate from the restaurant-to-activity walking limit", async () => {
    const pairs = await buildPairs({
      plan: pairedPlan(),
      restaurants: [scored({ id: "restaurant", city: "Westbury", county: "Nassau County", market: "Long Island", latitude: 40.7268, longitude: -73.6343 })],
      activities: [scored({ id: "activity", city: "Mineola", county: "Nassau County", market: "Long Island", latitude: 40.7305, longitude: -73.6369 })],
    });
    expect(pairs).toHaveLength(1);
    expect(pairs[0].walkingMinutes).toBeLessThanOrEqual(30);
  });

  it("rejects pairs that are both inside the locality radius but over the walking limit", async () => {
    const pairs = await buildPairs({
      plan: pairedPlan(),
      restaurants: [scored({ id: "restaurant", city: "Garden City", county: "Nassau County", market: "Long Island", latitude: 40.7268, longitude: -73.6343 })],
      activities: [scored({ id: "activity", city: "Westbury", county: "Nassau County", market: "Long Island", latitude: 40.7557, longitude: -73.5876 })],
    });
    expect(pairs).toHaveLength(0);
  });
});

describe("per-lane geography diagnostics", () => {
  it("reports canonical predicates and requested-area radius", () => {
    expect(buildGeoPredicateDiagnostics({
      neighborhood: "Astoria",
      borough: "Queens",
      state: "NY",
      latitude: 40.7644,
      longitude: -73.9235,
      radiusMiles: 3,
    })).toMatchObject({
      canonicalName: "Astoria",
      market: "NYC",
      borough: "Queens",
      requestedAreaRadiusMiles: 3,
      coordinateFirst: true,
    });
  });
});
