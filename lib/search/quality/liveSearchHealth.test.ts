import { describe, expect, it } from "vitest";
import { classifyLiveSearchHealth } from "./liveSearchHealth";

describe("classifyLiveSearchHealth", () => {
  it("treats dinner with live jazz as explicit mixed intent", () => {
    const result = classifyLiveSearchHealth({
      rawQuery: "Romantic Italian dinner with live jazz in Manhattan tonight",
      restaurantCount: 12,
      activityCount: 0,
      pairCount: 0,
    });

    expect(result.explicit.restaurant).toBe(true);
    expect(result.explicit.activity).toBe(true);
    expect(result.healthy).toBe(false);
    expect(result.issueType).toBe("missing_required_activity");
  });

  it("keeps a fulfilled mixed search healthy", () => {
    const result = classifyLiveSearchHealth({
      rawQuery: "Italian dinner with live jazz in Manhattan",
      restaurantCount: 8,
      activityCount: 6,
      pairCount: 4,
    });

    expect(result.healthy).toBe(true);
    expect(result.issueType).toBeNull();
  });

  it("accepts evidence-backed no-pair outcomes", () => {
    const result = classifyLiveSearchHealth({
      rawQuery: "Halal dinner and karaoke within a twenty-minute walk in Flushing",
      restaurantCount: 4,
      activityCount: 14,
      pairCount: 0,
      outcome: "expected_constraint_no_pair",
    });

    expect(result.healthy).toBe(true);
    expect(result.acceptedOutcome).toBe(true);
  });
});
