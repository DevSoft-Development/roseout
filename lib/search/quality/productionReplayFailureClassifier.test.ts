import { describe, expect, it } from "vitest";
import {
  classifyProductionReplayFailure,
  PRODUCTION_REPLAY_REGRESSION_QUERIES,
  unresolvedRegressionQueries,
} from "./productionReplayFailureClassifier";

function response(options: {
  restaurants?: number;
  activities?: number;
  pairs?: number;
  profileCandidates?: number;
  fallback?: boolean;
  rejectedPairs?: Array<{ reason: string }>;
}) {
  const restaurants = Array.from({ length: options.restaurants ?? 0 }, (_, id) => ({ id: `r-${id}` }));
  const activities = Array.from({ length: options.activities ?? 0 }, (_, id) => ({ id: `a-${id}` }));
  const pairs = Array.from({ length: options.pairs ?? 0 }, (_, id) => ({ id: `p-${id}` }));
  return {
    restaurants,
    activities,
    pairs,
    retrieval: {
      profileCandidateCount: options.profileCandidates ?? restaurants.length + activities.length,
      legacyFallbackUsed: options.fallback ?? false,
    },
    timing: { totalMs: 900 },
    debug: {
      retrievalCalls: [{ domain: "restaurant" }, { domain: "activity" }],
      pairing: {
        pairCandidatesEvaluated: restaurants.length * activities.length,
        validPairCountBeforeRender: pairs.length,
        rejectedPairs: options.rejectedPairs ?? [],
      },
    },
  };
}

describe("production replay failure classification", () => {
  it("Garden City sushi + escape room records served and strict missing pairs", () => {
    const legacy = response({});
    const canonical = response({
      restaurants: 10,
      activities: 22,
      pairs: 0,
      profileCandidates: 19,
      rejectedPairs: [
        { reason: "pair_distance_exceeds_default_max" },
        { reason: "missing_coordinates" },
      ],
    });
    const strict = response({ restaurants: 10, activities: 22, pairs: 0, profileCandidates: 19 });

    const result = classifyProductionReplayFailure(legacy, canonical, strict);
    expect(result.reasons).toContain("served_missing_pair");
    expect(result.reasons).toContain("strict_missing_pair");
    expect(result.reasons).not.toContain("canonical_profile_no_candidates");
    expect(result.pairingDiagnostics.served.rejectionCounts.distance_exceeded).toBe(1);
    expect(result.pairingDiagnostics.served.rejectionCounts.missing_coordinates).toBe(1);
  });

  it("Flushing halal + karaoke identifies canonical profile coverage failure", () => {
    const result = classifyProductionReplayFailure(
      response({}),
      response({ restaurants: 0, activities: 0, pairs: 0, profileCandidates: 0 }),
      response({ restaurants: 0, activities: 0, pairs: 0, profileCandidates: 0 }),
    );

    expect(result.reasons).toEqual(expect.arrayContaining([
      "served_missing_pair",
      "strict_missing_pair",
      "canonical_profile_no_candidates",
    ]));
    expect(result.pairingDiagnostics.served.rejectionCounts.insufficient_domain_candidates).toBe(1);
  });

  it("Midtown steak + lounge does not fail served pairing when canonical returned pairs", () => {
    const result = classifyProductionReplayFailure(
      response({ restaurants: 3, activities: 10, pairs: 2 }),
      response({ restaurants: 3, activities: 10, pairs: 2, profileCandidates: 0, fallback: true }),
      response({ restaurants: 0, activities: 0, pairs: 0, profileCandidates: 0 }),
    );

    expect(result.reasons).not.toContain("served_missing_pair");
    expect(result.reasons).toEqual(expect.arrayContaining([
      "strict_missing_pair",
      "canonical_profile_no_candidates",
      "legacy_fallback",
    ]));
  });

  it("holds canary while any of the five production regressions still fail", () => {
    expect(PRODUCTION_REPLAY_REGRESSION_QUERIES).toHaveLength(5);
    expect(unresolvedRegressionQueries([
      { query: PRODUCTION_REPLAY_REGRESSION_QUERIES[0], passed: false },
      { query: PRODUCTION_REPLAY_REGRESSION_QUERIES[1], passed: true },
    ])).toEqual([PRODUCTION_REPLAY_REGRESSION_QUERIES[0]]);
  });
});
