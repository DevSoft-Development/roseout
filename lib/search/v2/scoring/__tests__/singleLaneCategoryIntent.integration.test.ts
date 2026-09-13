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
  it("treats steak restaurant as steakhouse category intent instead of admitting unrelated cuisines with a steak mention", async () => {
    const result = await score("best steak restaurant in manhattan", [
      { id: "steakhouse", name: "Prime Cut Steakhouse", cuisine: "steakhouse", primary_category: "steakhouse", foods: ["steak"] },
      { id: "seafood", name: "Harbor Seafood", cuisine: "seafood", foods: ["steak", "lobster"] },
      { id: "italian", name: "Roma Italian", cuisine: "italian", foods: ["steak", "pasta"] },
    ]);

    expect(result.restaurants.map((item) => item.candidate.candidate.location.id)).toEqual(["steakhouse"]);
  });

  it("keeps dish intent broad when the user asks for a restaurant with steak", async () => {
    const result = await score("best restaurant with steak in manhattan", [
      { id: "italian-steak", name: "Roma Italian", cuisine: "italian", signature_items: ["grilled ribeye steak"] },
      { id: "no-steak", name: "Pasta House", cuisine: "italian", signature_items: ["cacio e pepe"] },
    ]);

    expect(result.restaurants.some((item) => item.candidate.candidate.location.id === "italian-steak")).toBe(true);
  });
});