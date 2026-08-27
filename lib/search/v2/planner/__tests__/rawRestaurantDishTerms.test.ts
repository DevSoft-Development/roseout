import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../buildSearchPlan";
import { buildRetrievalRequests } from "../../retrieval/buildRetrievalRequests";
import { buildProfileRpcParams } from "../../retrieval/retrieveProfileLocations";

async function restaurantPlan(query: string) {
  return buildSearchPlan({
    input: {
      query,
      requestId: "raw-dish-test",
      selectedLane: "restaurant",
    },
  });
}

describe("Search V2 raw restaurant dish preservation", () => {
  it.each([
    ["cacio e pepe in Queens", "cacio e pepe"],
    ["farfalle cacio e pepe in Queens", "farfalle cacio e pepe"],
    ["lobster ravioli in Queens", "lobster ravioli"],
    ["birria ramen in Brooklyn", "birria ramen"],
  ])("preserves arbitrary dish wording for %s", async (dishQuery, expected) => {
    const plan = await restaurantPlan(
      `Plan a restaurant only. ${dishQuery} Location: Queens. Return the best options, ranked by fit.`,
    );

    expect(plan.restaurant.foods).toContain(expected);

    const request = buildRetrievalRequests(plan).find(
      (candidate) => candidate.desiredRole === "restaurant",
    );
    expect(request).toBeDefined();
    expect(request?.foods).toContain(expected);

    const rpc = buildProfileRpcParams(request!);
    expect([rpc.p_query, ...rpc.p_categories]).toContain(expected);
  });

  it("keeps broad cuisine evidence while adding the authored dish phrase", async () => {
    const plan = await restaurantPlan(
      "Plan a restaurant only. lobster ravioli in Queens Location: Queens. Return the best options, ranked by fit.",
    );

    expect(plan.restaurant.foods).toContain("lobster ravioli");
    expect(
      [...plan.restaurant.cuisines, ...plan.restaurant.foods].some(
        (term) => term === "seafood" || term === "lobster",
      ),
    ).toBe(true);
  });

  it.each([
    "Plan a restaurant only. romantic date night in Queens Location: Queens. Return the best options, ranked by fit.",
    "Plan a restaurant only. quiet dinner in Queens Location: Queens. Return the best options, ranked by fit.",
    "Plan a restaurant and activity outing. dinner then bowling in Queens Location: Queens. Return the best options, ranked by fit.",
  ])("does not invent raw dish terms for normal search language: %s", async (query) => {
    const plan = await restaurantPlan(query);
    const foods = plan.restaurant.foods.join(" ");

    expect(foods).not.toMatch(/romantic date night|quiet dinner|dinner then bowling/);
  });
});
