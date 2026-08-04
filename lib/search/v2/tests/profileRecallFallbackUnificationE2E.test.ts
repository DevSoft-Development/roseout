import { describe, expect, it } from "vitest";
import { buildRetrievalRequests } from "../retrieval/buildRetrievalRequests";
import { adaptV2ResponseToCurrentPublicContract } from "../response/compatibilityAdapter";

describe("complete multi-category retrieval", () => {
  it("preserves all requested activity clauses within the bounded request budget", () => {
    const plan = {
      restaurant: { required: true, cuisines: ["japanese"], foods: [], features: [], mealPeriods: ["dinner"] },
      activity: { required: true, categories: ["escape_room", "arcade", "bowling", "mini_golf", "pottery", "axe_throwing"], features: [] },
      geo: { source: "explicit", market: "LONG_ISLAND", state: "NY", county: "Nassau", borough: null, city: null, neighborhood: null, latitude: 40.7268, longitude: -73.6343, radiusMiles: 8, strictness: "strict" },
    } as any;
    const requests = buildRetrievalRequests(plan);
    expect(requests.map((request) => request.desiredRole)).toEqual(expect.arrayContaining([
      "restaurant", "escape_room_activity", "arcade_activity", "bowling_activity", "mini_golf_activity", "pottery_activity", "axe_throwing_activity",
    ]));
  });
});

describe("recovered pair promotion", () => {
  it("publishes eligible recovered pairs as normal pairs while retaining diagnostics", () => {
    const response = adaptV2ResponseToCurrentPublicContract({
      version: "public-search-v2", success: true, requestFulfilled: true, partialResults: false, requestId: "test", requestedMode: "paired_outing", resolvedMode: "paired_outing", primaryDomain: "mixed", primary_domain: "mixed", displayMode: "pairs",
      searchPlan: {} as any, restaurants: [], activities: [], sameVenueResults: [],
      pairs: [{ restaurant: { id: "r" } as any, activity: { id: "a" } as any, distanceMiles: 1, walkingMinutes: 20, score: 90, isFallbackPair: true }],
      builder: { enabled: false, restaurants: [], activities: [], selectedRestaurantId: null, selectedActivityId: null },
      anchor: { requested: false, resolved: false, rawName: null, relationship: null, location: null },
      counts: { restaurantCandidates: 1, activityCandidates: 1, dualRoleCandidates: 0, restaurantCards: 0, activityCards: 0, builderRestaurantCards: 0, builderActivityCards: 0, uniquePairRestaurants: 1, uniquePairActivities: 1, sameVenueCards: 0, pairs: 1, displayedResults: 1 },
      fallback: { used: true, reason: "nearby_geo_used" },
      retrieval: { configuredMode: "primary", servedSource: "mixed", profileVersion: 4, canaryBucket: null, canaryPercent: null, profileCandidateCount: 1, legacyCandidateCount: 1, legacyFallbackUsed: true, fallbackDomains: ["activity"] },
      message: "ok", timing: {}, ml: { enabled: false, modelVersion: null, rankingVariant: "control", configuredVariant: null, appliedVariant: "control", applied: false, shadowOnly: false, rolloutBucket: null, reason: "disabled" },
    } as any);
    expect(response.pairs[0].isFallbackPair).toBe(false);
    expect(response.fallback_pair_count).toBe(0);
    expect(response.promoted_pair_count).toBe(1);
    expect(response.fallbackDiagnostics.affectedDomains).toEqual(["activity"]);
    expect(response.fallbackDiagnostics.reason).toBe("nearby_geo_used");
  });
});
