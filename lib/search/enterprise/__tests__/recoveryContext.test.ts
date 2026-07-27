import { describe, expect, it, vi } from "vitest";
import { buildRecoveryKey, createRecoveryRequestContext, executeRecoveryOnce } from "../recoveryContext";

describe("request-scoped recovery RPC context", () => {
  it("normalizes deterministic keys", () => {
    const base = { lane: "activity" as const, latitude: 40.123456, longitude: -73.987654, radiusMiles: 5, market: " NYC ", borough: "Manhattan", city: null, state: "NY", stage: "pair", relaxedCandidateEligibility: true, allowCrossDomain: true, maxPairDistanceMiles: 3 };
    expect(buildRecoveryKey({ ...base, query: "  Rooftop   BAR " }))
      .toBe(buildRecoveryKey({ ...base, query: "rooftop bar", latitude: 40.123459, longitude: -73.987651 }));
  });

  it("shares the same promise and records a concurrent cache hit", async () => {
    const context = createRecoveryRequestContext();
    const execute = vi.fn(async () => ({ restaurants: [], activities: [], pairs: [] } as any));
    const first = executeRecoveryOnce(context, "key", "activity", execute);
    const second = executeRecoveryOnce(context, "key", "activity", execute);
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(context).toMatchObject({ recoveryRpcCount: 1, recoveryCacheHitCount: 1, rpcDedupedCount: 1 });
  });
});
