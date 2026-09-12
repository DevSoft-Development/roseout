import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../../planner/buildSearchPlan";
import { buildRetrievalRequests } from "../../retrieval/buildRetrievalRequests";
import { candidateFrom } from "../../retrieval/retrieveCandidates";
import { assignCandidateRoles } from "../../roles/assignCandidateRoles";
import { scoreCandidates } from "../scoreCandidates";

async function score(rows: Record<string, unknown>[]) {
  const plan = await buildSearchPlan({ input: { query: "best steak and lobster in nyc" } });
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

describe("explicit multi-dish evidence ranking", () => {
  it("keeps complete verified steak + lobster evidence above partial and generic restaurants", async () => {
    const result = await score([
      { id: "sports-bar", name: "Sports Bar", cuisine: "spanish", primary_category: "sports_bar", signature_items: ["ribeye steak"] },
      { id: "verified", name: "Verified Steakhouse", cuisine: "steakhouse", signature_items: ["16 oz ribeye steak", "butter poached lobster tail"] },
      { id: "bakery", name: "Bakery", cuisine: "bakery", signature_items: ["croissant"] },
    ]);

    expect(result.restaurants[0]?.candidate.candidate.location.id).toBe("verified");
    expect(result.restaurants[0]?.reasons.some((reason) => reason.startsWith("verified multi-dish menu coverage"))).toBe(true);
    expect(result.restaurants.some((item) => item.candidate.candidate.location.id === "bakery")).toBe(false);
  });

  it("prefers a published owner-menu match over otherwise equal lower-provenance menu evidence", async () => {
    const result = await score([
      { id: "website", name: "Website Match", signature_items: ["ribeye steak", "lobster tail"], exact_menu_inventory_priority: 2 },
      { id: "owner", name: "Owner Match", signature_items: ["ribeye steak", "lobster tail"], exact_menu_inventory_priority: 3 },
    ]);
    expect(result.restaurants[0]?.candidate.candidate.location.id).toBe("owner");
  });
});
