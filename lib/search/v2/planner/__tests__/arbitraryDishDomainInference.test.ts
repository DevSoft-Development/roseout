import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../buildSearchPlan";
import { buildRetrievalRequests } from "../../retrieval/buildRetrievalRequests";

const arbitraryDishCases = [
  "cacio e pepe",
  "lobster ravioli",
  "birria ramen",
  "oxtail mac and cheese",
  "truffle beef carpaccio",
] as const;

describe("Search V2 system-wide arbitrary dish inference", () => {
  it.each(arbitraryDishCases)("opens restaurant retrieval without a forced lane for %s", async (dish) => {
    const plan = await buildSearchPlan({ input: { query: `${dish} in Queens` } });

    expect(plan.mode).toBe("restaurant_only");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(false);
    expect(plan.restaurant.foods).toContain(dish);
    expect(plan.geo.borough).toBe("Queens");
  });

  it("passes the full arbitrary dish phrase into retrieval evidence", async () => {
    const plan = await buildSearchPlan({ input: { query: "cacio e pepe in Queens" } });
    const request = buildRetrievalRequests(plan).find((item) => item.desiredRole === "restaurant");

    expect(request).toBeDefined();
    expect(request?.foods).toContain("cacio e pepe");
    expect(request?.retrievalTerms).toContain("cacio e pepe");
  });

  it("restores the restaurant half when an arbitrary dish is paired with an activity", async () => {
    const plan = await buildSearchPlan({ input: { query: "cacio e pepe then bowling in Queens" } });

    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.restaurant.foods).toContain("cacio e pepe");
    expect(plan.activity.required).toBe(true);
    expect(plan.activity.categories).toContain("bowling");
    expect(plan.pairing.required).toBe(true);
  });

  it.each([
    "bowling in Queens",
    "bowling with friends in Queens",
    "something fun in Queens",
  ])("does not invent a restaurant lane for activity-only language: %s", async (query) => {
    const plan = await buildSearchPlan({ input: { query } });

    expect(plan.activity.required).toBe(true);
    expect(plan.restaurant.required).toBe(false);
    expect(plan.restaurant.foods).toEqual([]);
  });

  it("does not manufacture food terms for ordinary date-night language", async () => {
    const plan = await buildSearchPlan({ input: { query: "date night in Brooklyn" } });

    expect(plan.restaurant.required).toBe(true);
    expect(plan.restaurant.foods).toEqual([]);
    expect(plan.geo.borough).toBe("Brooklyn");
  });
});
