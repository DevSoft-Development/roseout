import { describe, expect, it } from "vitest";
import { buildProfileRpcAttempts } from "../retrieval/retrieveProfileLocations";

function request(input: {
  desiredRole: "restaurant" | "activity";
  city?: string | null;
  neighborhood?: string | null;
  borough?: string | null;
  county?: string | null;
  market?: string | null;
  radiusMiles?: number | null;
  cuisines?: string[];
  foods?: string[];
  categories?: string[];
  features?: string[];
  retrievalTerms?: string[];
}) {
  return {
    desiredRole: input.desiredRole,
    cuisines: input.cuisines ?? [],
    foods: input.foods ?? [],
    categories: input.categories ?? [],
    features: input.features ?? [],
    retrievalTerms: input.retrievalTerms ?? [],
    eligibleStorageTypes: [],
    geo: {
      source: "explicit",
      state: "NY",
      city: input.city ?? null,
      neighborhood: input.neighborhood ?? null,
      borough: input.borough ?? null,
      county: input.county ?? null,
      market: input.market ?? null,
      latitude: 40.75,
      longitude: -73.9,
      radiusMiles: input.radiusMiles ?? 6,
      strictness: "preferred",
    },
  } as any;
}

function allTerms(attempts: ReturnType<typeof buildProfileRpcAttempts>) {
  return new Set(attempts.flatMap((attempt) => [attempt.p_query, ...attempt.p_categories]));
}

describe("search-wide canonical profile lane recovery contracts", () => {
  const geographies = [
    { city: "Flushing", borough: "Queens", county: "Queens County", market: "NYC" },
    { city: "Astoria", borough: "Queens", county: "Queens County", market: "NYC" },
    { city: "New York", neighborhood: "Midtown", borough: "Manhattan", county: "New York County", market: "NYC" },
    { city: "Huntington", county: "Suffolk County", market: "LONG_ISLAND" },
  ];

  it.each(geographies)("preserves exact requested-area predicates for $city", (geo) => {
    const attempts = buildProfileRpcAttempts(request({
      desiredRole: "restaurant",
      ...geo,
      radiusMiles: 7,
      foods: ["dinner"],
      retrievalTerms: ["restaurant"],
    }), 60, false);

    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0]?.p_radius_miles).toBe(7);
    expect(attempts[0]?.p_city).toBe(geo.city);
    expect(attempts[0]?.p_county).toBe(geo.county ?? null);
  });

  it.each(geographies)("uses reusable halal and zabiha evidence in $city", (geo) => {
    const attempts = buildProfileRpcAttempts(request({
      desiredRole: "restaurant",
      ...geo,
      foods: ["halal"],
      retrievalTerms: ["halal restaurant"],
    }));
    const terms = allTerms(attempts);

    expect(terms.has("halal")).toBe(true);
    expect(terms.has("zabiha")).toBe(true);
    expect(terms.has("zabiha restaurant")).toBe(true);
  });

  it.each(geographies)("uses reusable karaoke aliases in $city", (geo) => {
    const attempts = buildProfileRpcAttempts(request({
      desiredRole: "activity",
      ...geo,
      categories: ["karaoke"],
      retrievalTerms: ["karaoke"],
    }));
    const terms = allTerms(attempts);

    expect(terms.has("karaoke")).toBe(true);
    expect(terms.has("ktv")).toBe(true);
    expect(terms.has("singing room")).toBe(true);
    expect(terms.has("sing-along")).toBe(true);
  });

  it("keeps requested-area radius independent from pair walking distance", () => {
    const attempts = buildProfileRpcAttempts(request({
      desiredRole: "activity",
      city: "Flushing",
      borough: "Queens",
      county: "Queens County",
      market: "NYC",
      radiusMiles: 6,
      categories: ["karaoke"],
      retrievalTerms: ["karaoke"],
    }), 60, false);

    expect(attempts[0]?.p_radius_miles).toBe(6);
    expect(attempts.some((attempt) => attempt.p_radius_miles === 1)).toBe(false);
  });

  it("builds independent restaurant and activity predicate ladders", () => {
    const restaurantAttempts = buildProfileRpcAttempts(request({
      desiredRole: "restaurant",
      city: "Huntington",
      county: "Suffolk County",
      market: "LONG_ISLAND",
      cuisines: ["seafood"],
      retrievalTerms: ["seafood restaurant"],
    }));
    const activityAttempts = buildProfileRpcAttempts(request({
      desiredRole: "activity",
      city: "Huntington",
      county: "Suffolk County",
      market: "LONG_ISLAND",
      categories: ["bowling"],
      retrievalTerms: ["bowling"],
    }));

    expect(restaurantAttempts.every((attempt) => attempt.p_domain === "restaurant")).toBe(true);
    expect(activityAttempts.every((attempt) => attempt.p_domain === "activity")).toBe(true);
    expect(allTerms(restaurantAttempts).has("seafood")).toBe(true);
    expect(allTerms(activityAttempts).has("bowling")).toBe(true);
  });
});
