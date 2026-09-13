import { describe, expect, it } from "vitest";
import type { SearchPlan } from "../../planner/searchPlanTypes";
import { applyMlBoost } from "../applyMlBoost";
import { detectDistanceIntent, detectQualityIntent } from "../rankingIntent";

function plan(rawQuery: string, travel: Partial<SearchPlan["travel"]> = {}) {
  return {
    rawQuery,
    travel: {
      mode: "unspecified",
      constraint: "none",
      explicit: false,
      ...travel,
    },
  } as SearchPlan;
}

describe("query-driven ranking intent", () => {
  it("does not treat planner wrapper copy as a quality request", () => {
    const intent = detectQualityIntent(
      "Plan a restaurant only. steak restaurant in nyc Location: New York. Return the best options, ranked by fit.",
    );

    expect(intent).toEqual({ overall: false, rating: false, popularity: false });
  });

  it("activates quality signals when the user actually asks for best", () => {
    expect(detectQualityIntent("best steak restaurant in nyc").overall).toBe(true);
  });

  it("separates rating and popularity requests", () => {
    expect(detectQualityIntent("highest rated sushi in queens").rating).toBe(true);
    expect(detectQualityIntent("sushi with lots of reviews in queens").popularity).toBe(true);
  });

  it("keeps distance neutral for an ordinary location-scoped search", () => {
    expect(detectDistanceIntent(plan("Italian restaurant in Manhattan"))).toBe(false);
  });

  it.each([
    "Italian restaurant near me",
    "closest Italian restaurant",
    "walkable Italian restaurant",
    "Italian restaurant within 2 miles",
  ])("activates distance only when proximity is requested: %s", (query) => {
    expect(detectDistanceIntent(plan(query))).toBe(true);
  });

  it("honors an explicitly parsed travel constraint", () => {
    expect(detectDistanceIntent(plan("Italian restaurant", { explicit: true, constraint: "soft" }))).toBe(true);
  });

  it("does not apply the generic historical ML score to every search", () => {
    const result = applyMlBoost({ ml_score: 100 } as never, true);
    expect(result.score).toBe(100);
    expect(result.boost).toBe(0);
  });
});
