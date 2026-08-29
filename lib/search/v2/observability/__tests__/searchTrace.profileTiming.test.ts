import { describe, expect, it } from "vitest";

import { createSearchTrace, recordTiming } from "../searchTrace";

describe("profile retrieval timing aggregation", () => {
  it("uses the slowest concurrent lane while counting all attempts", () => {
    const trace = createSearchTrace("profile-timing-test");
    const attempt = (desiredRole: string, scoutMs: number, hydrationMs: number) =>
      trace.decisions.push({
        stage: "profile_retrieval_predicates",
        decision: "profile_attempt_succeeded",
        reason: JSON.stringify({
          desiredRole,
          domain: desiredRole === "restaurant" ? "restaurant" : "activity",
          scoutMs,
          hydrationMs,
          fallbackRpcMs: 0,
        }),
      });

    attempt("restaurant", 100, 20);
    attempt("restaurant", 80, 30);
    attempt("bowling_activity", 260, 40);

    recordTiming(trace, "retrievalMs", performance.now());

    expect(trace.timing.profileScoutMs).toBe(260);
    expect(trace.timing.profileHydrationMs).toBe(50);
    expect(trace.timing.profileFallbackRpcMs).toBe(0);
    expect(trace.timing.profileAttemptCount).toBe(3);
  });
});
