import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { buildRetrievalRequests } from "../retrieval/buildRetrievalRequests";

const arbitraryDishCases = [
  "cacio e pepe",
  "lobster ravioli",
  "birria ramen",
  "oxtail mac and cheese",
  "truffle beef carpaccio",
] as const;

describe("Search Core V2 arbitrary dish planning", () => {
  it.each(arbitraryDishCases)("restores the restaurant lane for arbitrary dish: %s", async (dish) => {
    const plan = await buildSearchPlan({ input: { query: `${dish} in Queens` } });

    expect(plan.mode).toBe("restaurant_only");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(false);
    expect(plan.restaurant.foods).toContain(dish);
    expect(plan.geo.borough).toBe("Queens");
  });

  it("preserves arbitrary dish wording as direct V2 retrieval evidence", async () => {
    const plan = await buildSearchPlan({ input: { query: "cacio e pepe in Queens" } });
    const restaurantRequest = buildRetrievalRequests(plan).find(
      (request) => request.desiredRole === "restaurant",
    );

    expect(restaurantRequest).toBeDefined();
    expect(restaurantRequest?.foods).toContain("cacio e pepe");
    expect(restaurantRequest?.retrievalTerms).toContain("cacio e pepe");
  });

  it("restores an arbitrary dish as the restaurant half of a mixed outing", async () => {
    const plan = await buildSearchPlan({
      input: { query: "cacio e pepe then bowling in Queens" },
    });

    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.restaurant.foods).toContain("cacio e pepe");
    expect(plan.activity.required).toBe(true);
    expect(plan.activity.categories).toContain("bowling");
    expect(plan.pairing.required).toBe(true);
  });

  it("does not turn an activity-only social phrase into restaurant food", async () => {
    const plan = await buildSearchPlan({ input: { query: "bowling with friends in Queens" } });

    expect(plan.activity.required).toBe(true);
    expect(plan.restaurant.required).toBe(false);
    expect(plan.restaurant.foods).toEqual([]);
  });

  it("does not manufacture dish terms for a normal date-night search", async () => {
    const plan = await buildSearchPlan({ input: { query: "date night in Brooklyn" } });

    expect(plan.restaurant.required).toBe(true);
    expect(plan.restaurant.foods).toEqual([]);
    expect(plan.geo.borough).toBe("Brooklyn");
  });
});
