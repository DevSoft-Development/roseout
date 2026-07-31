import { describe, expect, it } from "vitest";
import { enforceRequestedDomains } from "../index";

const restaurant = { selectedRole: "restaurant" } as any;
const activity = { selectedRole: "general_activity" } as any;

function plan(restaurantRequired: boolean, activityRequired: boolean) {
  return {
    restaurant: { required: restaurantRequired },
    activity: { required: activityRequired },
  } as any;
}

describe("single-domain serving purity", () => {
  it("removes restaurant candidates from activity-only searches", () => {
    const result = enforceRequestedDomains(plan(false, true), {
      all: [restaurant, activity],
      restaurants: [restaurant],
      activities: [activity],
    });

    expect(result.restaurants).toEqual([]);
    expect(result.activities).toEqual([activity]);
    expect(result.all).toEqual([activity]);
  });

  it("removes activity candidates from restaurant-only searches", () => {
    const result = enforceRequestedDomains(plan(true, false), {
      all: [restaurant, activity],
      restaurants: [restaurant],
      activities: [activity],
    });

    expect(result.restaurants).toEqual([restaurant]);
    expect(result.activities).toEqual([]);
    expect(result.all).toEqual([restaurant]);
  });

  it("preserves both domains for paired searches", () => {
    const result = enforceRequestedDomains(plan(true, true), {
      all: [restaurant, activity],
      restaurants: [restaurant],
      activities: [activity],
    });

    expect(result.restaurants).toEqual([restaurant]);
    expect(result.activities).toEqual([activity]);
    expect(result.all).toEqual([restaurant, activity]);
  });
});
