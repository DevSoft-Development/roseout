import { resolveSearchV3RolloutPolicy } from "../rollout/searchV3RolloutPolicy";

describe("Search V3 rollout policy", () => {
  it("defaults to shadow with V2 fallback preserved", () => {
    const policy = resolveSearchV3RolloutPolicy("request-1", {});
    expect(policy.mode).toBe("shadow");
    expect(policy.serveV3).toBe(false);
    expect(policy.runV3Shadow).toBe(true);
    expect(policy.allowV2Fallback).toBe(true);
  });

  it("supports deterministic canary buckets", () => {
    const env = {
      SEARCH_V3_ROLLOUT_MODE: "canary",
      SEARCH_V3_CANARY_PERCENT: "25",
    } as NodeJS.ProcessEnv;
    expect(resolveSearchV3RolloutPolicy("same-request", env)).toEqual(
      resolveSearchV3RolloutPolicy("same-request", env),
    );
  });

  it("requires an explicit switch to retire V2 fallback", () => {
    const policy = resolveSearchV3RolloutPolicy("request-1", {
      SEARCH_V3_ROLLOUT_MODE: "primary",
      SEARCH_V3_V2_FALLBACK_ENABLED: "false",
    });
    expect(policy.serveV3).toBe(true);
    expect(policy.allowV2Fallback).toBe(false);
  });
});
