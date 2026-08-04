import { describe, expect, it } from "vitest";
import type { PairingDebugTrace } from "../observability/searchTrace";

describe("PairingDebugTrace constructor contract", () => {
  it("requires every authoritative eligibility field to be initialized", () => {
    const debug = {
      restaurantCandidates: 0,
      activityCandidates: 0,
      pairCandidatesEvaluated: 0,
      validPairCountBeforeRender: 0,
      validPairCountAfterConstraints: 0,
      validPairCountAfterDiversification: 0,
      renderEligiblePairCount: 0,
      finalEligiblePairs: [],
      eligibilityContractValid: true,
      eligibilityContractViolation: null,
      rejectionCounts: {
        distance_exceeded: 0,
        missing_coordinates: 0,
        market_mismatch: 0,
        walkability_constraint: 0,
        schedule_open_hours_conflict: 0,
        same_venue_constraint: 0,
        insufficient_domain_candidates: 0,
        other: 0,
      },
      rejectedPairs: [],
      primaryFailure: null,
    } satisfies PairingDebugTrace;

    expect(debug.renderEligiblePairCount).toBe(0);
    expect(debug.finalEligiblePairs).toEqual([]);
    expect(debug.eligibilityContractValid).toBe(true);
  });
});
