import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { validateSearchPlan } from "../planner/validateSearchPlan";

describe("single-domain same-venue phrasing", () => {
  it.each([
    "seafood rooftop restaurant in Brooklyn",
    "seafood rooftop restaurant in Queens",
    "seafood rooftop restaurant in Astoria",
  ])("keeps %s as a valid restaurant-only plan", async (query) => {
    const plan = await buildSearchPlan({ input: { query } });

    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(false);
    expect(plan.pairing.required).toBe(false);
    expect(plan.mode).toBe("restaurant_only");
    expect(() => validateSearchPlan(plan)).not.toThrow();
  });
});
