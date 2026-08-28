import { describe, expect, it } from "vitest";
import { deterministicParse } from "../planner/deterministicParser";
import { buildSearchPlan } from "../planner/buildSearchPlan";

describe("production QA intent regressions", () => {
  it("keeps explicit activity exclusions out of positive activity taxonomy", async () => {
    const query = "date night in Brooklyn, no museums and no bowling";
    const parsed = deterministicParse({ query } as any);

    expect(parsed.explicitNegatives.activity).toEqual(
      expect.arrayContaining(["museum", "bowling"]),
    );
    expect(parsed.activityCategories).not.toContain("museum");
    expect(parsed.activityCategories).not.toContain("bowling");

    const plan = await buildSearchPlan({
      input: {
        query,
        activityExclusions: parsed.explicitNegatives.activity,
      } as any,
    });

    expect(plan.activity.exclusions).toEqual(
      expect.arrayContaining(["museum", "bowling"]),
    );
    expect(plan.activity.categories).not.toContain("museum");
    expect(plan.activity.categories).not.toContain("bowling");
  });

  it("treats brunch with cocktails and outdoor seating as restaurant-only features", () => {
    const parsed = deterministicParse({
      query: "brunch with cocktails and outdoor seating in Long Island City",
    } as any);

    expect(parsed.restaurantSignal).toBe(true);
    expect(parsed.restaurantFeatures).toEqual(
      expect.arrayContaining(["cocktails", "outdoor_seating"]),
    );
    expect(parsed.activitySignal).toBe(false);
    expect(parsed.activityCategories).not.toContain("lounge");
  });

  it("keeps sports bar food plus a watched game in the restaurant lane", () => {
    const parsed = deterministicParse({
      query: "sports bar with wings to watch the Knicks game",
    } as any);

    expect(parsed.restaurantSignal).toBe(true);
    expect(parsed.foodMatches).toContain("wings");
    expect(parsed.activitySignal).toBe(false);
  });

  it("still treats an explicit sequential game stop as an activity", () => {
    const parsed = deterministicParse({
      query: "dinner then a game in Queens",
    } as any);

    expect(parsed.restaurantSignal).toBe(true);
    expect(parsed.activitySignal).toBe(true);
    expect(parsed.sequence).toBe("restaurant_first");
  });
});