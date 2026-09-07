import { describe, expect, it } from "vitest";
import { googleSearchCacheKey, priorityAllowedForMode } from "../google-places-cost-control";

describe("Google Places cost controls", () => {
  it("uses a stable normalized cache key for IDs-only searches", () => {
    expect(googleSearchCacheKey("  Caribbean   restaurant in Queens ")).toBe(
      googleSearchCacheKey("caribbean restaurant in queens"),
    );
  });

  it("reduces optional work as the budget mode tightens", () => {
    expect(priorityAllowedForMode("low", "normal")).toBe(true);
    expect(priorityAllowedForMode("low", "reduce_low_priority")).toBe(false);
    expect(priorityAllowedForMode("normal", "critical_only")).toBe(false);
    expect(priorityAllowedForMode("high", "critical_only")).toBe(true);
    expect(priorityAllowedForMode("high", "stop_optional_paid_google")).toBe(false);
    expect(priorityAllowedForMode("critical", "stop_optional_paid_google")).toBe(true);
    expect(priorityAllowedForMode("critical", "disabled")).toBe(false);
  });
});
