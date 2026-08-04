import { describe, expect, it } from "vitest";
import {
  classifyProductionReplayFailure,
  collectCandidateLossDiagnostics,
  productionReplayCanaryReady,
  unresolvedRegressionQueries,
  PRODUCTION_REPLAY_REGRESSION_QUERIES,
} from "./productionReplayFailureClassifier";

function mixedResponse(overrides: Record<string, any> = {}) {
  const restaurants = overrides.restaurants ?? [];
  const activities = overrides.activities ?? [];
  const pairs = overrides.pairs ?? [];
  return {
    restaurants,
    activities,
    pairs,
    retrieval: {
      profileCandidateCount: overrides.profileCandidateCount ?? restaurants.length + activities.length,
      legacyFallbackUsed: overrides.legacyFallbackUsed ?? false,
      supportedMarket: overrides.supportedMarket,
      inventoryGapConfirmed: overrides.inventoryGapConfirmed,
      inventoryAudit: overrides.inventoryAudit,
    },
    timing: { totalMs: overrides.totalMs ?? 500 },
    status: overrides.status,
    outcome: overrides.outcome,
    success: overrides.success,
    requestFulfilled: overrides.requestFulfilled,
    debug: {
      retrievalCalls: [{ domain: "restaurant" }, { domain: "activity" }],
      anchorResolution: overrides.anchorResolution,
      candidateStages: overrides.candidateStages,
      inventoryAudit: overrides.debugInventoryAudit,
      pairing: {
        pairCandidatesEvaluated: overrides.pairCandidatesEvaluated ?? 0,
        validPairCountBeforeRender: overrides.validPairCountBeforeRender ?? pairs.length,
        validPairCountAfterDiversification: overrides.finalEligiblePairCount,
        rejectedPairs: overrides.rejectedPairs ?? [],
      },
    },
    searchPlan: overrides.searchPlan,
  };
}

describe("production replay dispositions", () => {
  it("preserves candidate loss stages and per-reason rejected candidate counts", () => {
    const response = mixedResponse({
      profileCandidateCount: 19,
      candidateStages: {
        profileCandidates: 19,
        geoEligibleCandidates: 16,
        domainAssignedCandidates: 10,
        taxonomyEligibleCandidates: 4,
        publishableCandidates: 2,
        finalRestaurantCandidates: 1,
        finalActivityCandidates: 1,
        rejectedCandidates: [
          { locationId: "a", rejectedAtStage: "geo", rejectionReason: "outside_requested_area" },
          { locationId: "b", rejectedAtStage: "taxonomy", rejectionReason: "taxonomy_mismatch" },
          { locationId: "c", rejectedAtStage: "taxonomy", rejectionReason: "taxonomy_mismatch" },
        ],
      },
    });

    const diagnostics = collectCandidateLossDiagnostics(response);
    expect(diagnostics.profileCandidates).toBe(19);
    expect(diagnostics.geoEligibleCandidates).toBe(16);
    expect(diagnostics.domainAssignedCandidates).toBe(10);
    expect(diagnostics.taxonomyEligibleCandidates).toBe(4);
    expect(diagnostics.publishableCandidates).toBe(2);
    expect(diagnostics.rejectionReasonCounts).toEqual({
      outside_requested_area: 1,
      taxonomy_mismatch: 2,
    });
    expect(diagnostics.hasStageEvidence).toBe(true);
  });

  it("keeps unexplained zero-domain collapse as a fixable canary blocker", () => {
    const response = mixedResponse({
      profileCandidateCount: 19,
      restaurants: [],
      activities: [],
      pairs: [],
      finalEligiblePairCount: 0,
      candidateStages: {
        profileCandidates: 19,
        geoEligibleCandidates: 19,
        domainAssignedCandidates: 0,
        finalRestaurantCandidates: 0,
        finalActivityCandidates: 0,
      },
    });

    const result = classifyProductionReplayFailure(mixedResponse(), response, response);
    expect(result.disposition).toBe("fixable_regression");
    expect(result.blocksCanary).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.retirementEligible).toBe(false);
    expect(result.reasons).toContain("unexpected_missing_pair");
  });

  it("marks only an explicitly audited inventory gap as non-blocking and retirement eligible", () => {
    const response = mixedResponse({
      profileCandidateCount: 19,
      restaurants: [],
      activities: [],
      pairs: [],
      finalEligiblePairCount: 0,
      inventoryGapConfirmed: true,
      inventoryAudit: {
        id: "audit-garden-city-1",
        status: "confirmed_gap",
        supportedMarket: true,
      },
    });

    const result = classifyProductionReplayFailure(mixedResponse(), response, response);
    expect(result.disposition).toBe("known_inventory_gap");
    expect(result.blocksCanary).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.retirementEligible).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.diagnosticReasons).toContain("unexpected_missing_pair");
    expect(result.candidateLossDiagnostics.served.inventoryAuditId).toBe("audit-garden-city-1");
  });

  it("accepts canonical generic-anchor clarification without legacy fallback", () => {
    const response = mixedResponse({
      status: "clarification_required",
      anchorResolution: {
        status: "ambiguous",
        requiresClarification: true,
        anchorKind: "generic",
      },
    });

    const result = classifyProductionReplayFailure(mixedResponse(), response, response);
    expect(result.disposition).toBe("clarification_required");
    expect(result.blocksCanary).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.retirementEligible).toBe(false);
  });

  it("accepts a truthful named-anchor not-found outcome and makes it reviewable for retirement", () => {
    const response = mixedResponse({
      status: "anchor_not_found",
      anchorResolution: {
        status: "not_found",
        anchorKind: "named",
        query: "Gaming City",
      },
    });

    const result = classifyProductionReplayFailure(mixedResponse(), response, response);
    expect(result.disposition).toBe("anchor_not_found");
    expect(result.blocksCanary).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.retirementEligible).toBe(true);
  });

  it("accepts unsupported-market outcomes without hiding supported-market retrieval defects", () => {
    const unsupported = mixedResponse({
      status: "unsupported_market",
      supportedMarket: false,
    });
    const supportedButBroken = mixedResponse({
      supportedMarket: true,
      profileCandidateCount: 12,
      finalEligiblePairCount: 0,
    });

    expect(classifyProductionReplayFailure(mixedResponse(), unsupported, unsupported).disposition)
      .toBe("unsupported_market");
    expect(classifyProductionReplayFailure(mixedResponse(), supportedButBroken, supportedButBroken).disposition)
      .toBe("fixable_regression");
  });

  it("does not let a non-blocking disposition remain in unresolved required regressions", () => {
    expect(unresolvedRegressionQueries([
      {
        query: PRODUCTION_REPLAY_REGRESSION_QUERIES[0],
        passed: true,
        blocksCanary: false,
      },
      {
        query: PRODUCTION_REPLAY_REGRESSION_QUERIES[1],
        passed: false,
        blocksCanary: true,
      },
    ])).toEqual([PRODUCTION_REPLAY_REGRESSION_QUERIES[1]]);
  });

  it("allows canary with expected dispositions but blocks fixable and temporary failures", () => {
    expect(productionReplayCanaryReady({
      persistedRowCount: 3,
      rowCount: 3,
      rows: [
        { passed: true, blocksCanary: false },
        { passed: true, blocksCanary: false },
        { passed: true, blocksCanary: false },
      ],
      unresolvedRequiredRegressions: [],
      p95LatencyMs: 2000,
    })).toBe(true);

    expect(productionReplayCanaryReady({
      persistedRowCount: 1,
      rowCount: 1,
      rows: [{ passed: false, blocksCanary: true }],
      unresolvedRequiredRegressions: [PRODUCTION_REPLAY_REGRESSION_QUERIES[0]],
      p95LatencyMs: 2000,
    })).toBe(false);
  });
});
