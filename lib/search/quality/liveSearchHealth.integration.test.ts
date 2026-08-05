import { describe, expect, it } from "vitest";

import { classifyLiveSearchHealth } from "./liveSearchHealth";

describe("live Search Health integration", () => {
  it("does not label the exact live-jazz query healthy when activity results are missing", () => {
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
});
