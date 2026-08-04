import { describe, expect, it } from "vitest";
import {
  classifyProductionReplayFailure,
  normalizePairRejectionReason,
  productionReplayCanaryReady,
  PRODUCTION_REPLAY_REGRESSION_QUERIES,
  unresolvedRegressionQueries,
} from "./productionReplayFailureClassifier";

function response(options: {
  restaurants?: number;
  activities?: number;
  pairs?: number;
  profileCandidates?: number;
  fallback?: boolean;
  rejectedPairs?: Array<{ reason: string; detail?: string }>;
  validPairCountBeforeRender?: number;
  success?: boolean;
  requestFulfilled?: boolean;
  explicitWalkingMinutes?: number;
}) {
  const restaurants = Array.from({ length: options.restaurants ?? 0 }, (_, id) => ({ id: `r-${id}` }));
  const activities = Array.from({ length: options.activities ?? 0 }, (_, id) => ({ id: `a-${id}` }));
  const pairs = Array.from({ length: options.pairs ?? 0 }, (_, id) => ({ id: `p-${id}` }));
  return {
    success: options.success,
    requestFulfilled: options.requestFulfilled,
    restaurants,
    activities,
    pairs,
    searchPlan: {
      pairing: {
        requireWalkable: options.explicitWalkingMinutes != null,
        maxWalkingMinutes: options.explicitWalkingMinutes ?? null,
      },
      travel: {
        explicit: options.explicitWalkingMinutes != null,
        constraint: options.explicitWalkingMinutes != null ? "walking_minutes" : "none",
      },
    },
    retrieval: {
      profileCandidateCount: options.profileCandidates ?? restaurants.length + activities.length,
      legacyFallbackUsed: options.fallback ?? false,
    },
    timing: { totalMs: 900 },
    debug: {
      retrievalCalls: [{ domain: "restaurant" }, { domain: "activity" }],
      pairing: {
        pairCandidatesEvaluated: restaurants.length * activities.length,
        validPairCountBeforeRender: options.validPairCountBeforeRender ?? pairs.length,
        rejectedPairs: options.rejectedPairs ?? [],
      },
    },
  };
}

describe("production replay failure classification", () => {
  it("normalizes raw walkability_constraint without falling into other", () => {
    expect(normalizePairRejectionReason("walkability_constraint")).toBe("walkability_constraint");
    expect(normalizePairRejectionReason("requested_walking_limit_exceeded")).toBe("walkability_constraint");
  });

  it("treats a legitimate explicit walking-limit rejection as expected_constraint_no_pair", () => {
    const constrained = response({
      restaurants: 2,
      activities: 3,
      pairs: 0,
      profileCandidates: 5,
      explicitWalkingMinutes: 20,
      rejectedPairs: Array.from({ length: 6 }, () => ({
        reason: "walkability_constraint",
        detail: "requested_walking_limit_exceeded",
      })),
    });

    const result = classifyProductionReplayFailure(response({}), constrained, constrained);
    expect(result.passed).toBe(true);
    expect(result.pairOutcome).toBe("expected_constraint_no_pair");
    expect(result.strictPairOutcome).toBe("expected_constraint_no_pair");
    expect(result.reasons).not.toContain("unexpected_missing_pair");
    expect(result.pairingDiagnostics.served.rejectionCounts.walkability_constraint).toBe(6);
    expect(result.pairingDiagnostics.served.rejectionCounts.other).toBe(0);
  });

  it("blocks when a viable pair existed before render but was omitted", () => {
    const canonical = response({
      restaurants: 2,
      activities: 2,
      pairs: 0,
      profileCandidates: 4,
      validPairCountBeforeRender: 2,
    });
    const result = classifyProductionReplayFailure(response({}), canonical, canonical);

    expect(result.passed).toBe(false);
    expect(result.pairOutcome).toBe("unexpected_missing_pair");
    expect(result.reasons).toContain("viable_pair_omitted");
    expect(result.reasons).toContain("unexpected_missing_pair");
  });

  it("blocks zero-domain retrieval for a required mixed request", () => {
    const empty = response({ restaurants: 0, activities: 0, pairs: 0, profileCandidates: 0 });
    const result = classifyProductionReplayFailure(response({}), empty, empty);

    expect(result.passed).toBe(false);
    expect(result.pairOutcome).toBe("unexpected_missing_pair");
    expect(result.reasons).toContain("canonical_profile_no_candidates");
    expect(result.pairingDiagnostics.served.rejectionCounts.insufficient_domain_candidates).toBe(1);
  });

  it("blocks a false success claim when no pair fulfilled the request", () => {
    const falseSuccess = response({
      restaurants: 1,
      activities: 1,
      pairs: 0,
      profileCandidates: 2,
      success: true,
      requestFulfilled: true,
    });
    const result = classifyProductionReplayFailure(response({}), falseSuccess, falseSuccess);

    expect(result.reasons).toContain("false_pair_fulfillment");
    expect(result.passed).toBe(false);
  });

  it("detects served versus strict pair-outcome parity failures", () => {
    const served = response({ restaurants: 2, activities: 2, pairs: 0, profileCandidates: 4 });
    const strict = response({ restaurants: 2, activities: 2, pairs: 1, profileCandidates: 4 });
    const result = classifyProductionReplayFailure(response({}), served, strict);

    expect(result.servedStrictPairParityMismatch).toBe(true);
    expect(result.reasons).toContain("served_strict_pair_parity_mismatch");
  });

  it("does not treat a served fallback pair plus strict constrained no-pair as a parity failure", () => {
    const served = response({ restaurants: 2, activities: 2, pairs: 1, profileCandidates: 4 });
    const strict = response({
      restaurants: 2,
      activities: 2,
      pairs: 0,
      profileCandidates: 4,
      explicitWalkingMinutes: 20,
      rejectedPairs: [{ reason: "walkability_constraint", detail: "requested_walking_limit_exceeded" }],
    });
    const result = classifyProductionReplayFailure(response({}), served, strict);

    expect(result.servedStrictPairParityMismatch).toBe(false);
  });

  it("does not block canary solely for expected constraint no-pair rows", () => {
    const constrained = response({
      restaurants: 1,
      activities: 1,
      pairs: 0,
      profileCandidates: 2,
      explicitWalkingMinutes: 20,
      rejectedPairs: [{ reason: "walkability_constraint", detail: "requested_walking_limit_exceeded" }],
    });
    const comparison = classifyProductionReplayFailure(response({}), constrained, constrained);

    expect(productionReplayCanaryReady({
      persistedRowCount: 1,
      rowCount: 1,
      rows: [{ passed: comparison.passed }],
      unresolvedRequiredRegressions: [],
      p95LatencyMs: 900,
    })).toBe(true);
  });

  it("continues blocking canary for unexpected failures", () => {
    expect(productionReplayCanaryReady({
      persistedRowCount: 1,
      rowCount: 1,
      rows: [{ passed: false }],
      unresolvedRequiredRegressions: [PRODUCTION_REPLAY_REGRESSION_QUERIES[0]],
      p95LatencyMs: 900,
    })).toBe(false);
  });

  it("holds canary while any required production regression still fails", () => {
    expect(PRODUCTION_REPLAY_REGRESSION_QUERIES).toHaveLength(5);
    expect(unresolvedRegressionQueries([
      { query: PRODUCTION_REPLAY_REGRESSION_QUERIES[0], passed: false },
      { query: PRODUCTION_REPLAY_REGRESSION_QUERIES[1], passed: true },
    ])).toEqual([PRODUCTION_REPLAY_REGRESSION_QUERIES[0]]);
  });
});
