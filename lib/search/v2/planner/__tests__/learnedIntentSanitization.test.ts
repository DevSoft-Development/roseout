import { describe, expect, it } from "vitest";
import { sanitizeRememberedRestaurantFoods } from "../applyLearnedIntent";

describe("learned search memory restaurant food sanitization", () => {
  it("rejects planner relationship and travel control terms from remembered foods", () => {
    expect(
      sanitizeRememberedRestaurantFoods([
        "same venue",
        "same",
        "venue",
        "under one roof",
        "under",
        "one",
        "roof",
        "walking distance",
        "walking",
        "distance",
      ]),
    ).toEqual([]);
  });

  it("rejects polluted compound memory terms while preserving actual dishes", () => {
    expect(
      sanitizeRememberedRestaurantFoods([
        "seafood restaurant same venue",
        "jerk chicken pasta",
        "lobster ravioli",
      ]),
    ).toEqual(["jerk chicken pasta", "lobster ravioli"]);
  });
});
