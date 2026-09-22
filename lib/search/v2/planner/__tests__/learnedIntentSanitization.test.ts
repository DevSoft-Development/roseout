import { describe, expect, it } from "vitest";
import { allowsRememberedRestaurantContent, sanitizeRememberedRestaurantFoods } from "../applyLearnedIntent";
import { buildSearchPlan } from "../buildSearchPlan";

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

  it("does not let semantic memory invent cuisine or food when the user authored restaurant constraints", async () => {
    const plan = await buildSearchPlan({
      input: {
        query: "Plan a restaurant and activity outing. Rooftop dinner and hookah after in manhattan Location: Manhattan. Return the best options, ranked by fit.",
        selectedLane: "auto",
      },
    });

    expect(plan.restaurant.features).toContain("rooftop");
    expect(plan.restaurant.cuisines).not.toContain("steakhouse");
    expect(plan.restaurant.foods).not.toContain("steak");
    expect(plan.activity.categories).toContain("hookah");
    expect(plan.activity.categories).not.toContain("rooftop");
    expect(allowsRememberedRestaurantContent(plan)).toBe(false);
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
