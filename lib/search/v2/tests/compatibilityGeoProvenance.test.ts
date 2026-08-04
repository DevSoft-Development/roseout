import { describe, expect, it } from "vitest";
import { adaptV2ResponseToCurrentPublicContract } from "../response/compatibilityAdapter";

function baseResponse() {
  return {
    version: "public-search-v2" as const,
    success: true,
    requestFulfilled: true,
    partialResults: false,
    requestId: "geo-contract",
    requestedMode: "paired_outing" as const,
    resolvedMode: "paired_outing" as const,
    primaryDomain: "mixed" as const,
    primary_domain: "mixed" as const,
    displayMode: "pairs" as const,
    searchPlan: {} as any,
    restaurants: [],
    activities: [],
    sameVenueResults: [],
    pairs: [
      {
        restaurant: { id: "restaurant-1", name: "Nearby restaurant" },
        activity: { id: "activity-1", name: "Nearby activity" },
        distanceMiles: 1.2,
        walkingMinutes: 24,
        score: 90,
        geoTier: "nearby_radius" as const,
        isFallbackPair: true,
        matchReasons: ["nearby options outside the exact locality"],
      },
    ],
    builder: {
      enabled: false,
      restaurants: [],
      activities: [],
      selectedRestaurantId: null,
      selectedActivityId: null,
    },
    anchor: {
      requested: false,
      resolved: false,
      rawName: null,
      relationship: null,
      location: null,
    },
    counts: {
      retrievedCandidates: 2,
      restaurantCandidates: 1,
      activityCandidates: 1,
      dualRoleCandidates: 0,
      restaurantCards: 0,
      activityCards: 0,
      builderRestaurantCards: 0,
      builderActivityCards: 0,
      uniquePairRestaurants: 1,
      uniquePairActivities: 1,
      sameVenueCards: 0,
      pairs: 1,
      displayedResults: 1,
    },
    fallback: { used: true, reason: "broader_geo_used" },
    geoResolution: {
      servedTier: "nearby_radius" as const,
      exactCandidateCount: 0,
      nearbyCandidateCount: 2,
      broaderCandidateCount: 0,
      broaderFallbackUsed: true,
    },
    retrieval: {
      configuredMode: "off" as const,
      servedSource: "legacy" as const,
      profileVersion: null,
      canaryBucket: null,
      canaryPercent: null,
      profileCandidateCount: 0,
      legacyCandidateCount: 2,
      legacyFallbackUsed: false,
      fallbackDomains: [],
    },
    message: "No exact matches were available, so nearby options are shown.",
    timing: {},
    ml: {
      enabled: false,
      modelVersion: null,
      rankingVariant: "control",
      configuredVariant: null,
      appliedVariant: "control",
      applied: false,
      shadowOnly: false,
      rolloutBucket: null,
      reason: "ML ranking was disabled.",
    },
  };
}

describe("public compatibility geography provenance", () => {
  it("preserves visible tier and fallback metadata through the public adapter", () => {
    const adapted = adaptV2ResponseToCurrentPublicContract(baseResponse() as any);

    expect(adapted.pairs[0].geoTier).toBe("nearby_radius");
    expect(adapted.pairs[0].isFallbackPair).toBe(true);
    expect(adapted.geoResolution.servedTier).toBe("nearby_radius");
    expect(adapted.geo_resolution.broaderFallbackUsed).toBe(true);
    expect(adapted.fallback).toEqual({ used: true, reason: "broader_geo_used" });
    expect(adapted.debug.geoResolution).toEqual(adapted.geoResolution);
    expect(adapted.searchV2.geoResolution).toEqual(adapted.geoResolution);
  });

  it("keeps a required mixed zero-pair response unsuccessful", () => {
    const response = baseResponse();
    response.success = false;
    response.requestFulfilled = false;
    response.partialResults = true;
    response.displayMode = "partial_mixed";
    response.pairs = [] as any;
    response.counts.pairs = 0;
    response.fallback = { used: true, reason: "no_pairs_within_distance" };
    response.geoResolution = {
      servedTier: null,
      exactCandidateCount: 2,
      nearbyCandidateCount: 0,
      broaderCandidateCount: 0,
      broaderFallbackUsed: false,
    };

    const adapted = adaptV2ResponseToCurrentPublicContract(response as any);
    expect(adapted.success).toBe(false);
    expect(adapted.requestFulfilled).toBe(false);
    expect(adapted.primaryResultType).toBe("partial_mixed");
  });
});
