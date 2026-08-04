import { describe, expect, it } from "vitest";
import { buildPairs } from "../pairing/buildPairs";
import { candidateMatchesRequestedGeo } from "../geo/geoBoundary";
import { createSearchTrace } from "../observability/searchTrace";
import { buildProfileRpcAttempts } from "../retrieval/retrieveProfileLocations";

function scored(id: string, city: string, latitude: number, longitude: number) {
  return {
    candidate: {
      candidate: {
        location: {
          id,
          city,
          state: "NY",
          latitude,
          longitude,
        },
      },
    },
    scores: { total: 80, quality: 80 },
  } as any;
}

function request(overrides: Record<string, unknown>) {
  return {
    desiredRole: "restaurant",
    cuisines: [],
    foods: [],
    features: [],
    categories: [],
    retrievalTerms: [],
    geo: {
      state: "NY",
      county: null,
      borough: null,
      city: null,
      neighborhood: null,
      market: null,
      latitude: null,
      longitude: null,
      radiusMiles: null,
    },
    ...overrides,
  } as any;
}

describe("general Search V2 pairing and canonical profile recovery", () => {
  it("trusts direct city matches when county metadata is missing", () => {
    const result = candidateMatchesRequestedGeo(
      { state: "NY", county: "Nassau County", city: "Garden City" },
      { id: "restaurant-1", state: "NY", city: "Garden City", county: null } as any,
    );

    expect(result.matches).toBe(true);
    expect(result.reason).toBe("direct_place_match");
  });

  it("constructs pairs and exposes the actual PairingDebug trace", async () => {
    const trace = createSearchTrace("pairing-regression");
    const plan = {
      rawQuery: "Sushi and an escape room near Garden City",
      geo: { state: "NY", county: "Nassau County", city: "Garden City" },
      pairing: {
        requireWalkable: false,
        maxWalkingMinutes: null,
        maxDistanceMiles: null,
        sameVenueRequired: false,
      },
    } as any;

    const pairs = await buildPairs({
      plan,
      restaurants: [scored("r1", "Garden City", 40.7268, -73.6343)],
      activities: [scored("a1", "Garden City", 40.7278, -73.6313)],
      trace,
    });

    expect(pairs).toHaveLength(1);
    expect(trace.pairingDebug?.pairCandidatesEvaluated).toBe(1);
    expect(trace.pairingDebug?.validPairCountBeforeRender).toBe(1);
    expect(trace.pairingDebug?.rejectedPairs).toEqual([]);
  });

  it("records every rejected pair with a normalized reason", async () => {
    const trace = createSearchTrace("walking-regression");
    const plan = {
      rawQuery: "Dinner and karaoke within a 20-minute walk",
      geo: { state: "NY", city: "Flushing" },
      pairing: {
        requireWalkable: true,
        maxWalkingMinutes: 20,
        maxDistanceMiles: 1,
        sameVenueRequired: false,
      },
    } as any;

    const pairs = await buildPairs({
      plan,
      restaurants: [scored("r1", "Flushing", 40.75, -73.83)],
      activities: [scored("a1", "Flushing", 40.80, -73.70)],
      trace,
    });

    expect(pairs).toHaveLength(0);
    expect(trace.pairingDebug?.pairCandidatesEvaluated).toBe(1);
    expect(trace.pairingDebug?.rejectionCounts.walkability_constraint).toBe(1);
    expect(trace.pairingDebug?.rejectedPairs[0]?.reason).toBe("walkability_constraint");
  });

  it("builds a canonical retrieval relaxation ladder for halal restaurants", () => {
    const attempts = buildProfileRpcAttempts(request({
      desiredRole: "restaurant",
      foods: ["halal"],
      retrievalTerms: ["halal restaurant"],
      geo: { state: "NY", city: "Flushing", county: "Queens County", latitude: null, longitude: null, radiusMiles: null },
    }));

    const terms = attempts.flatMap((attempt) => [attempt.p_query, ...attempt.p_categories]);
    expect(terms).toContain("halal");
    expect(terms).toContain("halal restaurant");
    expect(terms).toContain("middle eastern");
    expect(attempts.length).toBeGreaterThan(1);
  });

  it("builds general activity and lounge expansions without query-specific overrides", () => {
    const karaokeAttempts = buildProfileRpcAttempts(request({
      desiredRole: "activity",
      categories: ["karaoke"],
      retrievalTerms: ["karaoke"],
      geo: { state: "NY", city: "Flushing", county: "Queens County", latitude: null, longitude: null, radiusMiles: null },
    }));
    const loungeAttempts = buildProfileRpcAttempts(request({
      desiredRole: "activity",
      categories: ["relaxed lounge"],
      features: ["relaxed"],
      retrievalTerms: ["relaxed lounge"],
      geo: { state: "NY", city: "New York", neighborhood: "Midtown", latitude: null, longitude: null, radiusMiles: null },
    }));

    const karaokeTerms = karaokeAttempts.flatMap((attempt) => [attempt.p_query, ...attempt.p_categories]);
    const loungeTerms = loungeAttempts.flatMap((attempt) => [attempt.p_query, ...attempt.p_categories]);

    expect(karaokeTerms).toContain("karaoke lounge");
    expect(karaokeTerms).toContain("private karaoke");
    expect(loungeTerms).toContain("lounge");
    expect(loungeTerms).toContain("cocktail lounge");
  });
});
