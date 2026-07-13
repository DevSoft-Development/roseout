import { describe, expect, it } from "vitest";
import { buildSearchQualityContext, evaluateSearchQuality } from "../index";

describe("audience and intent search quality", () => {
  it("flags the teenage son Queens failure", () => {
    const context = buildSearchQualityContext({
      query: "Fun activities with my teenage son in queens",
      result: {
        success: true,
        activities: [
          { id: "nightlife-1", name: "Singing Karaoke Club", primary_category: "nightlife", primary_intent: "general", intent_boost: 0, activityQualityReasons: ["drinks/lounge/nightlife signal +20"] },
          { id: "arcade-1", name: "Gatcha", primary_category: "arcade", primary_intent: "general", intent_boost: 0 },
        ],
      },
    });
    const evaluation = evaluateSearchQuality(context);
    expect(evaluation.technicalSuccess).toBe(true);
    expect(evaluation.qualitySuccess).toBe(false);
    expect(evaluation.suspiciousFlags).toEqual(expect.arrayContaining([
      "minor_audience_not_applied",
      "adult_oriented_result_in_top_five",
      "generic_intent_used_for_specific_audience",
      "conflicting_positive_boost",
    ]));
    expect(evaluation.severity).toBe("critical");
  });
});
