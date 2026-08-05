import { describe, expect, it } from "vitest";
import { classifyProductionReplayFailure, productionReplayCanaryReady } from "./productionReplayFailureClassifier";

function mixedResponse(options: {
  restaurants?: number;
  activities?: number;
  pairs?: number;
  profileCandidates?: number;
  geoEligibleCandidates?: number;
  rejectedCandidates?: Array<{ rejectionReason: string }>;
  fallback?: boolean;
  fulfilled?: boolean;
  finalEligiblePairCount?: number;
  eligibilityContractValid?: boolean;
}) {
  const restaurants = Array.from({ length: options.restaurants ?? 0 }, (_, index) => ({ id: `r-${index}` }));
  const activities = Array.from({ length: options.activities ?? 0 }, (_, index) => ({ id: `a-${index}` }));
  const pairs = Array.from({ length: options.pairs ?? 0 }, (_, index) => ({ id: `p-${index}` }));
  return {
    requestFulfilled: options.fulfilled ?? false,
    restaurants,
    activities,
    pairs,
    retrieval: {
      profileCandidateCount: options.profileCandidates ?? restaurants.length + activities.length,
      legacyFallbackUsed: options.fallback ?? false,
      supportedMarket: true,
    },
    timing: { totalMs: 900 },
    debug: {
      retrievalCalls: [{ domain: "restaurant" }, { domain: "activity" }],
      candidateStages: {
        profileCandidates: options.profileCandidates ?? restaurants.length + activities.length,
        geoEligibleCandidates: options.geoEligibleCandidates ?? restaurants.length + activities.length,
        domainAssignedCandidates: restaurants.length + activities.length,
        taxonomyEligibleCandidates: restaurants.length + activities.length,
        publishableCandidates: restaurants.length + activities.length,
        finalRestaurantCandidates: restaurants.length,
        finalActivityCandidates: activities.length,
        rejectedCandidates: options.rejectedCandidates ?? [],
      },
      pairing: {
        pairCandidatesEvaluated: restaurants.length * activities.length,
        validPairCountBeforeRender: pairs.length,
        validPairCountAfterConstraints: options.finalEligiblePairCount ?? pairs.length,
        validPairCountAfterDiversification: options.finalEligiblePairCount ?? pairs.length,
        finalEligiblePairs: pairs,
        eligibilityContractValid: options.eligibilityContractValid ?? true,
        rejectedPairs: pairs.length === 0
          ? [{ reason: "insufficient_domain_candidates", detail: "activity_candidates_empty" }]
          : [],
      },
    },
  };
}

describe("evidence-backed inventory readiness policy", () => {
  it("accepts a requested-market inventory gap when every retrieved candidate is rejected for market mismatch", () => {
    const response = mixedResponse({
      profileCandidates: 19,
      geoEligibleCandidates: 0,
      restaurants: 0,
      activities: 0,
      pairs: 0,
      finalEligiblePairCount: 0,
      rejectedCandidates: Array.from({ length: 19 }, () => ({ rejectionReason: "market_mismatch" })),
    });

    const result = classifyProductionReplayFailure(mixedResponse({}), response, response);

    expect(result.inventoryGapOutcome).toBe(true);
    expect(result.disposition).toBe("known_inventory_gap");
    expect(result.blocksCanary).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.diagnosticReasons).toContain("unexpected_missing_pair");
  });

  it("accepts a missing local activity lane when the rejected candidates have explicit inventory evidence", () => {
    const response = mixedResponse({
      profileCandidates: 26,
      geoEligibleCandidates: 4,
      restaurants: 4,
      activities: 0,
      pairs: 0,
      finalEligiblePairCount: 0,
      rejectedCandidates: Array.from({ length: 22 }, () => ({ rejectionReason: "market_mismatch" })),
    });

    const result = classifyProductionReplayFailure(mixedResponse({}), response, response);

    expect(result.inventoryGapOutcome).toBe(true);
    expect(result.disposition).toBe("known_inventory_gap");
    expect(result.blocksCanary).toBe(false);
  });

  it("continues blocking a missing pair when candidate loss has no stage evidence", () => {
    const response = mixedResponse({
      profileCandidates: 0,
      geoEligibleCandidates: 0,
      restaurants: 0,
      activities: 0,
      pairs: 0,
      finalEligiblePairCount: 0,
      rejectedCandidates: [],
    });
    delete response.debug.candidateStages;

    const result = classifyProductionReplayFailure(mixedResponse({}), response, response);

    expect(result.inventoryGapOutcome).toBe(false);
    expect(result.disposition).toBe("fixable_regression");
    expect(result.blocksCanary).toBe(true);
  });

  it("continues blocking when a valid pair was omitted", () => {
    const response = mixedResponse({
      profileCandidates: 4,
      geoEligibleCandidates: 4,
      restaurants: 2,
      activities: 2,
      pairs: 0,
      finalEligiblePairCount: 1,
      rejectedCandidates: [{ rejectionReason: "market_mismatch" }],
    });
    response.debug.pairing.finalEligiblePairs = [{ restaurantId: "r-0", activityId: "a-0" }] as any;

    const result = classifyProductionReplayFailure(mixedResponse({}), response, response);

    expect(result.inventoryGapOutcome).toBe(false);
    expect(result.blocksCanary).toBe(true);
    expect(result.reasons).toContain("viable_pair_omitted");
  });

  it("treats legacy fallback as retirement debt instead of a canary blocker when a valid pair is served", () => {
    const response = mixedResponse({
      restaurants: 2,
      activities: 2,
      pairs: 1,
      profileCandidates: 4,
      fallback: true,
      finalEligiblePairCount: 1,
    });

    const result = classifyProductionReplayFailure(mixedResponse({}), response, response);

    expect(result.fallbackUsed).toBe(true);
    expect(result.diagnosticReasons).toContain("legacy_fallback");
    expect(result.reasons).not.toContain("legacy_fallback");
    expect(result.blocksCanary).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("allows canary readiness when the only rows are evidence-backed inventory outcomes and fallback warnings", () => {
    expect(productionReplayCanaryReady({
      persistedRowCount: 2,
      rowCount: 2,
      rows: [
        { passed: true, blocksCanary: false },
        { passed: true, blocksCanary: false },
      ],
      unresolvedRequiredRegressions: [],
      p95LatencyMs: 2100,
    })).toBe(true);
  });
});
