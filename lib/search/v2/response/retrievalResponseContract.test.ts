import { describe, expect, it } from "vitest";

import type { PublicSearchResponseV2 } from "./responseTypes";

function minimalResponse(): PublicSearchResponseV2 {
  return {
    version: "public-search-v2",
    success: true,
    requestFulfilled: true,
    partialResults: false,
    requestId: "00000000-0000-4000-8000-000000000001",
    requestedMode: "restaurant_only",
    resolvedMode: "restaurant_only",
    primaryDomain: "restaurant",
    primary_domain: "restaurant",
    displayMode: "restaurant_cards",
    searchPlan: {} as PublicSearchResponseV2["searchPlan"],
    restaurants: [],
    activities: [],
    sameVenueResults: [],
    pairs: [],
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
    counts: {} as PublicSearchResponseV2["counts"],
    fallback: { used: false, reason: null },
    retrieval: {
      configuredMode: "shadow",
      servedSource: "legacy",
      profileVersion: 3,
      canaryBucket: null,
      canaryPercent: 5,
      profileCandidateCount: 0,
      legacyCandidateCount: 0,
      legacyFallbackUsed: false,
      fallbackDomains: [],
    },
    message: "ok",
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
      reason: "disabled",
    },
  };
}

describe("public search retrieval diagnostics contract", () => {
  it("requires retrieval diagnostics on every public response", () => {
    const response = minimalResponse();
    expect(response.retrieval.configuredMode).toBe("shadow");
    expect(response.retrieval.servedSource).toBe("legacy");
    expect(response.retrieval.profileVersion).toBe(3);
  });
});
