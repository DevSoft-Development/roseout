import { describe, expect, it, beforeEach } from "vitest";
import { resolveSearchV3DatabaseRolloutPolicy } from "../rollout/searchV3RolloutPolicy";
import { DEFAULT_SEARCH_V3_CONTROLS, invalidateSearchV3RuntimeControlsCache } from "../controls/searchV3Controls";

type BreakerRow = { lane_id: string; open_until: string | null; probe_until: string | null };
function testDatabase(opts: { breakers?: BreakerRow[]; breakerError?: boolean; coreDisabled?: boolean } = {}) {
  const controls = {
    ...DEFAULT_SEARCH_V3_CONTROLS,
    mode: "canary" as const,
    canaryPercent: 5,
    lanes: {
      ...DEFAULT_SEARCH_V3_CONTROLS.lanes,
      structured: { ...DEFAULT_SEARCH_V3_CONTROLS.lanes.structured, enabled: !opts.coreDisabled },
    },
  };
  return {
    from(table: string) {
      if (table === "app_settings") return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { value: controls, updated_at: null }, error: null }) }),
        }),
      };
      if (table === "search_v3_lane_breakers") return {
        select: () => ({
          in: async () => opts.breakerError
            ? { data: null, error: { message: "unavailable" } }
            : { data: opts.breakers ?? [], error: null },
        }),
      };
      throw new Error("unexpected table: " + table);
    },
  };
}

describe("database-backed Search V3 serving gate", () => {
  beforeEach(() => invalidateSearchV3RuntimeControlsCache());

  it("uses stable deterministic canary buckets only while healthy", async () => {
    const db = testDatabase();
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) =>
      resolveSearchV3DatabaseRolloutPolicy("search:" + i, db),
    ));
    expect(results.every((v) => v.allowV2Fallback)).toBe(true);
    expect(results.some((v) => v.serveV3)).toBe(true);
    expect(results.some((v) => !v.serveV3)).toBe(true);
    expect(results.every((v) => v.serveV3 === (v.bucket < 5))).toBe(true);
  });

  it("forces shadow on an open shared core breaker", async () => {
    const db = testDatabase({ breakers: [{
      lane_id: "bm25",
      open_until: new Date(Date.now() + 60000).toISOString(),
      probe_until: null,
    }] });
    const result = await resolveSearchV3DatabaseRolloutPolicy("test", db);
    expect(result.mode).toBe("shadow");
    expect(result.serveV3).toBe(false);
    expect(result.allowV2Fallback).toBe(true);
  });

  it("forces shadow when shared breaker storage is unavailable", async () => {
    const result = await resolveSearchV3DatabaseRolloutPolicy("test", testDatabase({ breakerError: true }));
    expect(result.mode).toBe("shadow");
    expect(result.serveV3).toBe(false);
  });

  it("forces shadow when a mandatory lane is disabled", async () => {
    const result = await resolveSearchV3DatabaseRolloutPolicy("test", testDatabase({ coreDisabled: true }));
    expect(result.mode).toBe("shadow");
    expect(result.serveV3).toBe(false);
  });
});
