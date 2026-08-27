import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../../planner/buildSearchPlan";
import { buildRetrievalRequests } from "../buildRetrievalRequests";

async function restaurantRequestFor(query: string) {
  const plan = await buildSearchPlan({ input: { query } });
  const request = buildRetrievalRequests(plan).find((item) => item.desiredRole === "restaurant");
  expect(request).toBeDefined();
  return { plan, request: request! };
}

describe("restaurant dish retrieval priority", () => {
  it("keeps an authored multiword dish ahead of an inferred broad parent", async () => {
    const { plan, request } = await restaurantRequestFor("lobster ravioli in Queens");

    expect(plan.restaurant.foods).toContain("lobster ravioli");
    expect(plan.restaurant.foods).toContain("lobster");
    expect(plan.restaurant.foods).toContain("ravioli");
    expect(plan.restaurant.cuisines).toContain("seafood");

    const dishIndex = request.retrievalTerms.indexOf("lobster ravioli");
    const lobsterIndex = request.retrievalTerms.indexOf("lobster");
    const ravioliIndex = request.retrievalTerms.indexOf("ravioli");
    const seafoodIndex = request.retrievalTerms.indexOf("seafood");

    expect(dishIndex).toBeGreaterThanOrEqual(0);
    expect(lobsterIndex).toBeGreaterThanOrEqual(0);
    expect(ravioliIndex).toBeGreaterThanOrEqual(0);
    expect(seafoodIndex).toBeGreaterThanOrEqual(0);
    expect(dishIndex).toBeLessThan(seafoodIndex);
    expect(lobsterIndex).toBeLessThan(seafoodIndex);
    expect(ravioliIndex).toBeLessThan(seafoodIndex);
  });

  it("preserves the full exact dish phrase as retrieval evidence", async () => {
    const { request } = await restaurantRequestFor("farfalle cacio e pepe in Queens");

    expect(request.retrievalTerms).toContain("farfalle cacio e pepe");
    expect(request.retrievalTerms.indexOf("farfalle cacio e pepe")).toBeLessThan(
      request.retrievalTerms.indexOf("farfalle"),
    );
  });
});
