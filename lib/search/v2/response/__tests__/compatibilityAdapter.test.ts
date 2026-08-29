import { describe, expect, it } from "vitest";
import { adaptV2ResponseToCurrentPublicContract } from "../compatibilityAdapter";

function baseV2(overrides: Record<string, unknown> = {}) {
  return {
    success: false,
    message: "No pair matched the requested walking constraint.",
    restaurants: [{ id: "r1", name: "Restaurant" }],
    activities: [{ id: "a1", name: "Bowling" }],
    pairs: [],
    sameVenueResults: [],
    searchPlan: {
      restaurant: { required: true, cuisines: [], foods: [], features: [], exclusions: [] },
      activity: { required: true, categories: ["bowling"], features: [], exclusions: [] },
      pairing: { required: true },
      travel: { mode: "walking", explicit: true },
    },
    builder: { enabled: false, restaurants: [], activities: [] },
    anchor: { requested: false, resolved: false, rawName: null, location: null, relationship: null },
    fallback: { used: true, reason: "no_pairs_within_distance" },
    retrieval: { legacyFallbackUsed: false, fallbackDomains: [], servedSource: "canonical_profile", profileCandidateCount: 2 },
    geoResolution: null,
    timing: {},
    ml: null,
    debug: { pairingDebug: { primaryFailure: "travel_constraint_exceeded" } },
    counts: { builderRestaurantCards: 0, builderActivityCards: 0, uniquePairRestaurants: 0, uniquePairActivities: 0 },
    requestId: "test",
    requestFulfilled: false,
    partialResults: true,
    outcome: "expected_constraint_no_pair",
    displayMode: "partial_mixed",
    requestedMode: "paired_outing",
    resolvedMode: "paired_outing",
    primaryDomain: "mixed",
    primary_domain: "mixed",
    ...overrides,
  } as any;
}

describe("adaptV2ResponseToCurrentPublicContract", () => {
  it("preserves an expected constraint no-pair outcome", () => {
    const result = adaptV2ResponseToCurrentPublicContract(baseV2());

    expect(result.outcome).toBe("expected_constraint_no_pair");
    expect(result.searchV2.outcome).toBe("expected_constraint_no_pair");
    expect(result.fallbackDiagnostics.reason).toBe("no_pairs_within_distance");
  });

  it("still reports generic no-compatible-pair when no explicit constraint outcome exists", () => {
    const result = adaptV2ResponseToCurrentPublicContract(
      baseV2({ outcome: "no_results", fallback: { used: true, reason: null } }),
    );

    expect(result.outcome).toBe("no_compatible_pair");
    expect(result.requestFulfilled).toBe(false);
    expect(result.partialResults).toBe(true);
  });
});
