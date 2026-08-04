import { describe, expect, it } from "vitest";
import { buildGeoResolution } from "../fallback/resolveFallback";
import { adaptV2ResponseToCurrentPublicContract } from "../response/compatibilityAdapter";

function pair(tier: "exact_locality" | "nearby_radius" | "broader_fallback", fallback: boolean) {
  return {
    restaurant: { id: `r-${tier}` },
    activity: { id: `a-${tier}` },
    geoTier: tier,
    isFallbackPair: fallback,
  } as any;
}

function scored(tier: "exact_locality" | "nearby_radius" | "broader_fallback") {
  return {
    candidate: {
      candidate: {
        geoMatch: { tier },
        location: { id: tier },
      },
    },
  } as any;
}

function publicResponse(pairs: any[], geoResolution: any, fallback: any) {
  return {
    version: "public-search-v2",
    success: true,
    requestFulfilled: true,
    partialResults: false,
    requestId: "fallback-e2e",
    requestedMode: "paired_outing",
    resolvedMode: "paired_outing",
    primaryDomain: "mixed",
    primary_domain: "mixed",
    displayMode: "pairs",
    restaurants: [],
    activities: [],
    sameVenueResults: [],
    pairs,
    builder: { enabled: true, restaurants: [], activities: [], selectedRestaurantId: null, selectedActivityId: null },
    anchor: { requested: false, resolved: false, rawName: null, relationship: null, location: null },
    counts: {
      retrievedCandidates: 2,
      restaurantCandidates: 0,
      activityCandidates: 0,
      dualRoleCandidates: 0,
      restaurantCards: 0,
      activityCards: 0,
      builderRestaurantCards: 0,
      builderActivityCards: 0,
      uniquePairRestaurants: pairs.length ? 1 : 0,
      uniquePairActivities: pairs.length ? 1 : 0,
      sameVenueCards: 0,
      pairs: pairs.length,
      displayedResults: pairs.length,
    },
    fallback,
    geoResolution,
    message: "Fallback options shown.",
    timing: { plannerMs: 0, retrievalMs: 0, roleAssignmentMs: 0, scoringMs: 0, pairingMs: 0, fallbackMs: 0, validationMs: 0, serializationMs: 0, totalMs: 0 },
    ml: { enabled: false, modelVersion: null, rankingVariant: "control", rolloutBucket: null },
  } as any;
}

describe("fallback diagnostics end to end", () => {
  it("distinguishes nearby fallback from broader fallback", () => {
    const nearby = buildGeoResolution(
      { restaurants: [scored("nearby_radius")], activities: [scored("nearby_radius")] },
      [pair("nearby_radius", true)],
    );
    expect(nearby).toMatchObject({
      servedTier: "nearby_radius",
      fallbackUsed: true,
      nearbyFallbackUsed: true,
      broaderFallbackUsed: false,
    });

    const broader = buildGeoResolution(
      { restaurants: [scored("broader_fallback")], activities: [scored("broader_fallback")] },
      [pair("broader_fallback", true)],
    );
    expect(broader).toMatchObject({
      servedTier: "broader_fallback",
      fallbackUsed: true,
      nearbyFallbackUsed: false,
      broaderFallbackUsed: true,
    });
  });

  it("derives regression fallback counts from served pairs", () => {
    const geo = {
      servedTier: "nearby_radius",
      exactCandidateCount: 0,
      nearbyCandidateCount: 2,
      broaderCandidateCount: 0,
      fallbackUsed: true,
      nearbyFallbackUsed: true,
      broaderFallbackUsed: false,
    };
    const adapted = adaptV2ResponseToCurrentPublicContract(
      publicResponse([pair("nearby_radius", true), pair("nearby_radius", true)], geo, { used: true, reason: "nearby_geo_used" }),
    );

    expect(adapted.fallback_pair_count).toBe(2);
    expect(adapted.fallbackPairsUsedAsPrimary).toBe(true);
    expect(adapted.debug.fallbackPairCount).toBe(2);
    expect(adapted.debug.fallbackPairsUsedAsPrimary).toBe(true);
    expect(adapted.geoResolution).toEqual(geo);
    expect(adapted.fallback.reason).toBe("nearby_geo_used");
  });

  it("reports no fallback for exact pairs", () => {
    const geo = {
      servedTier: "exact_locality",
      exactCandidateCount: 2,
      nearbyCandidateCount: 0,
      broaderCandidateCount: 0,
      fallbackUsed: false,
      nearbyFallbackUsed: false,
      broaderFallbackUsed: false,
    };
    const adapted = adaptV2ResponseToCurrentPublicContract(
      publicResponse([pair("exact_locality", false)], geo, { used: false, reason: null }),
    );

    expect(adapted.fallback_pair_count).toBe(0);
    expect(adapted.fallbackPairsUsedAsPrimary).toBe(false);
    expect(adapted.geoResolution.fallbackUsed).toBe(false);
  });
});
