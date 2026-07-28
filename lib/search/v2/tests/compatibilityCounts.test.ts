import { describe, expect, it } from "vitest";
import { adaptV2ResponseToCurrentPublicContract } from "../response/compatibilityAdapter";

const response = {
  version: "public-search-v2" as const,
  success: true,
  requestFulfilled: false,
  partialResults: true,
  requestId: "request-1",
  requestedMode: "paired_outing" as const,
  resolvedMode: "paired_outing" as const,
  displayMode: "partial_mixed" as const,
  restaurants: [{ id: "restaurant-1" }],
  activities: [{ id: "activity-1" }],
  sameVenueResults: [],
  pairs: [],
  counts: {
    retrievedCandidates: 2,
    restaurantCandidates: 1,
    activityCandidates: 1,
    dualRoleCandidates: 0,
    restaurantCards: 1,
    activityCards: 1,
    sameVenueCards: 0,
    pairs: 0,
    displayedResults: 2,
  },
  fallback: { used: true, reason: "no_pairs_within_distance" },
  message: "Partial results",
  timing: {
    plannerMs: 0,
    retrievalMs: 0,
    roleAssignmentMs: 0,
    scoringMs: 0,
    pairingMs: 0,
    fallbackMs: 0,
    validationMs: 0,
    serializationMs: 0,
    totalMs: 0,
  },
  ml: {
    enabled: false,
    modelVersion: null,
    rankingVariant: "control",
    rolloutBucket: null,
  },
};

describe("V2 compatibility counts", () => {
  it("exposes scalar counts for Search Lab and Search Health", () => {
    const adapted = adaptV2ResponseToCurrentPublicContract(response as any);
    expect(adapted.restaurant_count).toBe(1);
    expect(adapted.activity_count).toBe(1);
    expect(adapted.pair_count).toBe(0);
    expect(adapted.result_count).toBe(2);
    expect(adapted.debug.canonicalCounts.displayedResults).toBe(2);
  });
});
