import { describe, expect, it } from "vitest";
import { applyAudienceSafetyToSearchResult } from "../suppression";

function baseResult(): any {
  return {
    success: true,
    restaurants: [],
    activities: [
      { id: "nightclub", name: "Teen Nightclub", primary_category: "nightclub", intent_boost: 40, ml_boost: 20, activityQualityReasons: ["drinks/lounge/nightlife signal +20"] },
      { id: "bar", name: "Late Night Lounge", primary_category: "nightlife bar", intent_boost: 30, activityQualityReasons: ["drinks/lounge/nightlife signal +20"] },
      { id: "arcade", name: "Queens Arcade", primary_category: "arcade", tags: ["all ages"] },
      { id: "museum", name: "Queens Museum", primary_category: "museum", tags: ["family friendly"] },
    ],
    pairs: [],
    matched_locations: [],
    render_mode: "activity_cards",
    reply: "",
    card_counts: { restaurants: 0, activities: 4, matched_locations: 0, pairs: 0 },
    debug: {},
  };
}

describe("automatic audience safety suppression", () => {
  it("suppresses adult-only venues, removes conflicting boosts and restores safety order", () => {
    const result = applyAudienceSafetyToSearchResult("Fun activities with my teenage son in Queens", baseResult());
    expect(result.activities.map((item: any) => item.id)).toEqual(["arcade", "museum", "bar"]);
    expect(result.activities.find((item: any) => item.id === "nightclub")).toBeUndefined();
    expect(result.activities.find((item: any) => item.id === "bar")?.intent_boost).toBe(0);
    expect((result.debug as any).audienceSafetyOrderReappliedAfterMl).toBe(true);
  });
});
