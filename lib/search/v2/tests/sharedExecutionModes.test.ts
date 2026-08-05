import { describe, expect, it, vi } from "vitest";
import { createSearchV2ExecutionCoordinator } from "@/lib/search/v2";

function responseFixture() {
  return {
    outcome: "pair_served",
    requestFulfilled: true,
    pairs: [{ restaurant: { id: "r1" }, activity: { id: "a1" } }],
    restaurants: [],
    activities: [],
    retrieval: {
      legacyFallbackUsed: true,
      fallbackDomains: ["restaurant"],
      profileCandidateCount: 7,
    },
    debug: {
      pairingDebug: {
        renderEligiblePairCount: 1,
        finalEligiblePairs: [{ restaurantId: "r1", activityId: "a1" }],
        eligibilityContractValid: true,
      },
    },
    timing: { totalMs: 120 },
  } as any;
}

function input(requestId: string, strictNoFallback: boolean) {
  return {
    query: "Karaoke and late-night food in Flushing",
    requestId,
    supabase: {} as any,
    rolloutOverride: {
      mode: "primary" as const,
      canaryPercent: 100,
      strictNoFallback,
    },
  };
}

describe("served and strict shared execution", () => {
  it("runs retrieval, lane assignment, pairing, fallback, and terminal outcome once", async () => {
    const execute = vi.fn(async () => responseFixture());
    const search = createSearchV2ExecutionCoordinator(execute as any);

    const [served, strict] = await Promise.all([
      search(input("run-1:canonical", false) as any),
      search(input("run-1:strict", true) as any),
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].requestId).toBe("run-1:shared");
    expect(execute.mock.calls[0][0].rolloutOverride.strictNoFallback).toBe(false);

    expect(served.outcome).toBe("pair_served");
    expect(strict.outcome).toBe("pair_served");
    expect(served.pairs).toEqual(strict.pairs);
    expect(served.debug.executionMode).toBe("served");
    expect(strict.debug.executionMode).toBe("strict");
    expect(served.debug.sharedExecutionId).toBe(strict.debug.sharedExecutionId);
    expect(strict.debug.strictPolicy).toEqual({
      evaluatesServedPipeline: true,
      legacyFallbackUsed: true,
      fallbackDomains: ["restaurant"],
    });
  });

  it("preserves expected constraint no-pair truth in both modes", async () => {
    const execute = vi.fn(async () => ({
      ...responseFixture(),
      outcome: "expected_constraint_no_pair",
      requestFulfilled: false,
      pairs: [],
      debug: {
        pairingDebug: {
          renderEligiblePairCount: 0,
          finalEligiblePairs: [],
          eligibilityContractValid: true,
          rejectedPairs: [{ reason: "distance_exceeded" }],
        },
      },
    } as any));
    const search = createSearchV2ExecutionCoordinator(execute as any);

    const [served, strict] = await Promise.all([
      search(input("run-2:canonical", false) as any),
      search(input("run-2:strict", true) as any),
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(served.outcome).toBe("expected_constraint_no_pair");
    expect(strict.outcome).toBe("expected_constraint_no_pair");
    expect(served.pairs).toEqual([]);
    expect(strict.pairs).toEqual([]);
  });

  it("does not deduplicate normal public searches", async () => {
    const execute = vi.fn(async () => responseFixture());
    const search = createSearchV2ExecutionCoordinator(execute as any);

    await Promise.all([
      search(input("public-request-a", false) as any),
      search(input("public-request-b", false) as any),
    ]);

    expect(execute).toHaveBeenCalledTimes(2);
  });
});
