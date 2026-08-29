import { describe, expect, it } from "vitest";

import { createSearchTrace } from "../../observability/searchTrace";
import { buildPublicSearchResponse } from "../buildPublicSearchResponse";

function scoredCandidate(id: string, name: string, role: string, locationType: string) {
  return {
    candidate: {
      candidate: {
        location: {
          id,
          name,
          location_type: locationType,
          primary_category: locationType,
          latitude: 40.71,
          longitude: -73.87,
        },
        retrievalSources: ["test"],
        matchedRetrievalTerms: [],
        requestedRoles: [role],
        distanceMiles: null,
        geoMatch: {
          accepted: true,
          tier: "exact_locality",
          scopeLevel: "neighborhood",
          reason: null,
        },
        retrievalGeoLevel: "neighborhood",
      },
      roles: [],
    },
    selectedRole: role,
    scores: {
      intentMatch: 0,
      roleConfidence: 0,
      geoFit: 0,
      quality: 0,
      featureMatch: 0,
      popularity: 0,
      audienceFit: 0,
      mlBoost: 0,
      penalties: 0,
      total: 0,
    },
    reasons: [],
    ml: {
      enabled: false,
      modelVersion: null,
      phase1Score: null,
      phase1Boost: 0,
      phase2Score: null,
      phase2Boost: 0,
      pairScore: null,
      pairBoost: 0,
      baseRank: null,
      finalRank: null,
      rankDelta: null,
    },
  } as any;
}

describe("buildPublicSearchResponse walking constraint outcome", () => {
  it("treats an explicit walkability miss as a successful partial constraint outcome", () => {
    const plan = {
      version: "search-plan-v1",
      requestId: "walking-test",
      rawQuery: "dinner then bowling in Forest Hills, walking distance",
      mode: "paired_outing",
      restaurant: { required: true, cuisines: [], foods: [], mealPeriods: ["dinner"], features: [], exclusions: [] },
      activity: { required: true, categories: ["bowling"], features: [], exclusions: [] },
      geo: { source: "explicit", market: "NYC_CORE", city: "New York", borough: "Queens", neighborhood: "Forest Hills", county: "Queens County", state: "NY", latitude: 40.71, longitude: -73.87, radiusMiles: 3, strictness: "strict" },
      anchor: { requested: false, rawName: null, locationId: null, name: null, latitude: null, longitude: null, entityType: "none", generic: false, exactNameRequired: false },
      travel: { mode: "walking", constraint: "soft", explicit: true, maxWalkingMinutes: 30, maxDrivingMinutes: null },
      pairing: { required: true, sameVenuePreferred: false, sameVenueRequired: false, sequence: "restaurant_first", maxDistanceMiles: 1.5, maxWalkingMinutes: 30, maxDrivingMinutes: null, requireWalkable: true },
      audience: { familyFriendly: false, minorsPresent: false, adultOnlyRequested: false },
      occasion: null,
      partySize: null,
      plannedFor: null,
      fallback: { allowNearbyPair: true, allowPartial: true, allowBroaderGeo: true, maximumRadiusMiles: 45 },
      confidence: { overall: 0.95, mode: 0.95, restaurant: 0.95, activity: 0.95, geo: 0.95 },
      parser: { source: "deterministic", reasons: [] },
    } as any;

    const restaurant = scoredCandidate("r1", "Restaurant", "restaurant", "restaurant");
    const activity = scoredCandidate("a1", "Bowling", "bowling_activity", "activity");
    const result = {
      requestedMode: "paired_outing",
      resolvedMode: "paired_outing",
      used: true,
      reason: "no_pairs_within_distance",
      requestFulfilled: false,
      partialResults: true,
      restaurants: [restaurant],
      activities: [activity],
      builderRestaurants: [restaurant],
      builderActivities: [activity],
      sameVenueResults: [],
      pairs: [],
      retrievedCandidates: 2,
      geoResolution: {
        servedTier: null,
        exactCandidateCount: 2,
        nearbyCandidateCount: 0,
        broaderCandidateCount: 0,
        fallbackUsed: false,
        nearbyFallbackUsed: false,
        broaderFallbackUsed: false,
      },
    } as any;

    const trace = createSearchTrace("walking-test");
    trace.pairingDebug = {
      restaurantCandidates: 1,
      activityCandidates: 1,
      theoreticalPairCandidates: 1,
      pairCandidatesEvaluated: 1,
      pairCandidatesSkipped: 0,
      shortCircuitApplied: false,
      shortCircuitReason: null,
      targetPairCount: 1,
      frontierPairCount: 1,
      adaptiveExpansionApplied: false,
      adaptiveRestaurantLimit: 1,
      adaptiveActivityLimit: 1,
      initialRestaurantLimit: 1,
      initialActivityLimit: 1,
      validPairCountBeforeRender: 0,
      validPairCountAfterConstraints: 0,
      validPairCountAfterDiversification: 0,
      renderEligiblePairCount: 0,
      finalEligiblePairs: [],
      eligibilityContractValid: true,
      eligibilityContractViolation: null,
      rejectionCounts: {
        distance_exceeded: 1,
        missing_coordinates: 0,
        market_mismatch: 0,
        walkability_constraint: 1,
        schedule_open_hours_conflict: 0,
        same_venue_constraint: 0,
        insufficient_domain_candidates: 0,
        other: 0,
      },
      rejectedPairs: [],
      nearestRejectedPair: null,
      allCandidatePairsExceededTravelLimit: true,
      primaryFailure: "travel_constraint_exceeded",
    };

    const response = buildPublicSearchResponse({ plan, result, trace });

    expect(response.outcome).toBe("expected_constraint_no_pair");
    expect(response.success).toBe(true);
    expect(response.requestFulfilled).toBe(false);
    expect(response.partialResults).toBe(true);
  });
});
