import { describe, expect, it } from "vitest";
import { chooseOutcomeState, normalizeSearchOutcomeEventKind, searchOutcomeColumnsFor } from "../outcomes";

describe("search outcome aggregation helpers", () => {
  it("normalizes canonical and legacy outcome event names", () => {
    expect(normalizeSearchOutcomeEventKind("reservation_started")).toBe("booking_action");
    expect(normalizeSearchOutcomeEventKind("phone click")).toBe("call");
    expect(normalizeSearchOutcomeEventKind("not-sensitive")).toBeNull();
  });

  it("uses explicit precedence for final outcome states", () => {
    expect(chooseOutcomeState(["impression", "abandonment", "click"])).toBe("engaged");
    expect(chooseOutcomeState(["click", "query_reformulation", "booking_action"])).toBe("conversion_intent");
  });

  it("emits one-column increments for idempotent upserts", () => {
    expect(searchOutcomeColumnsFor("share")).toMatchObject({ share_count: 1, click_count: 0 });
  });
});
