import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../../planner/buildSearchPlan";
import { buildRetrievalRequests } from "../../retrieval/buildRetrievalRequests";
import { candidateFrom } from "../../retrieval/retrieveCandidates";
import { assignCandidateRoles } from "../../roles/assignCandidateRoles";
import { scoreCandidates } from "../scoreCandidates";

async function score(query: string, rows: Record<string, unknown>[]) {
  const plan = await buildSearchPlan({ input: { query, selectedLane: "restaurant" } });
  const request = buildRetrievalRequests(plan).find((item) => item.desiredRole === "restaurant");
  expect(request).toBeDefined();
  const candidates = rows.map((row) => candidateFrom({
    location_type: "restaurant",
    rating: 4.6,
    review_count: 500,
    quality_score: 90,
    ...row,
  }, request!, "enterprise_search_profile_locations", plan));
  return scoreCandidates({ plan, candidates: assignCandidateRoles({ plan, candidates }) });
}

describe("single-lane restaurant category intent", () => {
  it.each([
    {
      query: "best steak restaurant in manhattan",
      expected: "steakhouse",
      rows: [
        { id: "steakhouse", name: "Prime Cut Steakhouse", cuisine: "steakhouse", primary_category: "steakhouse", foods: ["steak"] },
        { id: "seafood", name: "Harbor Seafood", cuisine: "seafood", foods: ["steak", "lobster"] },
        { id: "italian", name: "Roma Italian", cuisine: "italian", foods: ["steak", "pasta"] },
      ],
    },
    {
      query: "best chicken restaurant in queens",
      expected: "chicken",
      rows: [
        { id: "chicken", name: "Golden Chicken", primary_category: "chicken restaurant", cuisine: "american", foods: ["fried chicken"] },
        { id: "italian", name: "Roma Italian", cuisine: "italian", foods: ["chicken parm", "pasta"] },
        { id: "thai", name: "Bangkok Table", cuisine: "thai", foods: ["chicken basil"] },
      ],
    },
    {
      query: "best wings spot in brooklyn",
      expected: "wings",
      rows: [
        { id: "wings", name: "Wing House", primary_category: "wings", cuisine: "american", foods: ["buffalo wings"] },
        { id: "sports-bar", name: "Game Room", primary_category: "sports_bar", cuisine: "american", foods: ["buffalo wings"] },
      ],
    },
    {
      query: "best italian restaurant in manhattan",
      expected: "italian",
      rows: [
        { id: "italian", name: "Roma Italian", cuisine: "italian", foods: ["pasta"] },
        { id: "american", name: "Downtown Grill", cuisine: "american", description: "Popular near several Italian restaurants" },
      ],
    },
    {
      query: "best seafood restaurant in manhattan",
      expected: "seafood",
      rows: [
        { id: "seafood", name: "Harbor Seafood", cuisine: "seafood", foods: ["lobster"] },
        { id: "italian", name: "Roma Italian", cuisine: "italian", foods: ["shrimp", "pasta"], description: "Seafood specials available" },
      ],
    },
  ])("keeps $query inside the requested restaurant identity", async ({ query, expected, rows }) => {
    const result = await score(query, rows);
    expect(result.restaurants.map((item) => item.candidate.candidate.location.id)).toEqual([expected]);
  });

  it.each([
    ["best restaurant with steak in manhattan", "italian-steak", "grilled ribeye steak"],
    ["best restaurant with chicken in queens", "thai-chicken", "thai basil chicken"],
    ["best restaurant with wings in brooklyn", "bar-wings", "buffalo wings"],
  ])("keeps %s as dish intent instead of forcing a restaurant category", async (query, expected, dish) => {
    const result = await score(query, [
      { id: expected, name: "Menu Match", cuisine: "italian", signature_items: [dish] },
      { id: "no-match", name: "No Menu Match", cuisine: "italian", signature_items: ["pasta"] },
    ]);

    expect(result.restaurants.some((item) => item.candidate.candidate.location.id === expected)).toBe(true);
  });
});
