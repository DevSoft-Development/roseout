import { describe, expect, it } from "vitest";
import { deterministicParse } from "../planner/deterministicParser";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { buildSummary } from "@/app/api/admin/search-health/batch-run/route";

describe("system-wide intent, anchor, evaluator, geo, and pairing contracts", () => {
  it.each([
    "Sushi in Garden City followed by an escape room afterward for six people, no more than ten minutes driving.",
    "Mexican dinner with cocktails, then dancing or live music somewhere close by afterward for a group.",
    "Italian food first followed by karaoke, with both places suitable for eight adults and under a 30 minute walk.",
  ])("preserves paired intent through trailing modifiers: %s", async (query) => {
    const parsed = deterministicParse({ query });
    const plan = await buildSearchPlan({ input: { query } });
    expect(parsed.restaurantSignal).toBe(true);
    expect(parsed.activitySignal).toBe(true);
    expect(parsed.activityCategories.length).toBeGreaterThan(0);
    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
  });

  it.each([
    "Halal dinner near Main Street in Flushing and karaoke afterward",
    "Restaurant near 31st Street and Broadway, then live music",
    "Dinner near the Jamaica LIRR station followed by bowling",
  ])("keeps geographic entities out of named venue anchor resolution: %s", async (query) => {
    const parsed = deterministicParse({ query });
    const plan = await buildSearchPlan({ input: { query } });
    expect(["street", "intersection", "transit_stop"]).toContain(parsed.anchorEntityType);
    expect(plan.anchor.requested).toBe(false);
    expect(plan.mode).toBe("paired_outing");
  });

  it("marks generic anchors and exact named anchors explicitly", async () => {
    const generic = await buildSearchPlan({ input: { query: "Dinner near a skating rink in Queens" } });
    const exact = await buildSearchPlan({ input: { query: "Date night near a location called The Garden Room in Nassau County; use the exact named place and do not guess" } });
    expect(generic.anchor.entityType).toBe("generic_category");
    expect(generic.anchor.generic).toBe(true);
    expect(exact.anchor.entityType).toBe("named_venue");
    expect(exact.anchor.exactNameRequired).toBe(true);
  });

  it.each(["expected_constraint_no_pair", "clarification_required", "anchor_not_found"])("counts expected outcome as a passing QA result: %s", (outcome) => {
    const summary = buildSummary(0, "test", "v2", { success: false, outcome, searchV2: { outcome, counts: { restaurantCards: 0, activityCards: 0, pairs: 0, displayedResults: 0 }, success: false } }, 10);
    expect(summary.expectedOutcome).toBe(true);
    expect(summary.ok).toBe(true);
    expect(summary.suspiciousFlags).not.toContain("no_results");
  });
});
