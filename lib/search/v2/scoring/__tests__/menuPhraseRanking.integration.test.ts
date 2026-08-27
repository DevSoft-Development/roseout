import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../../planner/buildSearchPlan";
import { buildRetrievalRequests } from "../../retrieval/buildRetrievalRequests";
import { candidateFrom } from "../../retrieval/retrieveCandidates";
import { assignCandidateRoles } from "../../roles/assignCandidateRoles";
import { scoreCandidates } from "../scoreCandidates";

async function scoreRestaurantCandidates(query: string, rows: Record<string, unknown>[]) {
  const plan = await buildSearchPlan({ input: { query } });
  const request = buildRetrievalRequests(plan).find((item) => item.desiredRole === "restaurant");
  expect(request).toBeDefined();

  const candidates = rows.map((row) => candidateFrom(
    {
      location_type: "restaurant",
      rating: 4.5,
      review_count: 200,
      quality_score: 85,
      ...row,
    },
    request!,
    "enterprise_search_profile_locations",
    plan,
  ));
  const qualified = assignCandidateRoles({ plan, candidates });
  return scoreCandidates({ plan, candidates: qualified });
}

describe("exact menu phrase ranking", () => {
  it("ranks a full authored dish match above broad menu evidence", async () => {
    const scored = await scoreRestaurantCandidates("farfalle cacio e pepe in Queens", [
      {
        id: "broad-match",
        name: "Broad Pasta Place",
        signature_items: ["cacio e pepe", "farfalle primavera"],
      },
      {
        id: "exact-match",
        name: "American Brass",
        signature_items: ["wild mushroom tagliatelle", "farfalle cacio e pepe", "cheese ravioli"],
      },
    ]);

    expect(scored.restaurants[0]?.candidate.candidate.location.id).toBe("exact-match");
    expect(scored.restaurants[0]?.reasons).toContain("exact menu phrase match +8: farfalle cacio e pepe");
    expect(scored.restaurants[1]?.reasons.some((reason) => reason.startsWith("exact menu phrase match"))).toBe(false);
  });

  it("keeps graceful fallback when no single menu item contains the full requested dish", async () => {
    const scored = await scoreRestaurantCandidates("lobster ravioli in Queens", [
      {
        id: "split-evidence",
        name: "Split Evidence Italian",
        signature_items: ["lobster bisque", "cheese ravioli"],
      },
      {
        id: "broad-seafood",
        name: "Broad Seafood Place",
        signature_items: ["lobster", "seafood pasta"],
      },
    ]);

    expect(scored.restaurants.length).toBeGreaterThan(0);
    expect(scored.restaurants[0]?.candidate.candidate.location.id).toBe("split-evidence");
    expect(scored.restaurants[0]?.reasons).toContain("matched dish-specific evidence: lobster, ravioli");
    expect(scored.restaurants[0]?.reasons).toContain("matched requested restaurant terms: lobster, ravioli");
    expect(scored.restaurants[0]?.reasons.some((reason) => reason.includes("matched requested restaurant terms: lobster ravioli"))).toBe(false);
    for (const candidate of scored.restaurants) {
      expect(candidate.reasons.some((reason) => reason.startsWith("exact menu phrase match"))).toBe(false);
    }
  });

  it("ranks real dish evidence above a closer broad inferred cuisine fallback", async () => {
    const scored = await scoreRestaurantCandidates("lobster ravioli in Queens", [
      {
        id: "close-seafood-only",
        name: "Close Seafood Only",
        distance_miles: 0.3,
        signature_items: ["seafood platter", "grilled fish"],
        cuisines: ["seafood"],
      },
      {
        id: "farther-lobster",
        name: "Farther Lobster Evidence",
        distance_miles: 2.6,
        signature_items: ["lobster ramen", "pork gyoza"],
      },
    ]);

    expect(scored.restaurants[0]?.candidate.candidate.location.id).toBe("farther-lobster");
    expect(scored.restaurants[0]?.reasons).toContain("matched dish-specific evidence: lobster");
    expect(scored.restaurants[0]?.reasons).toContain("matched requested restaurant terms: lobster");
    expect(scored.restaurants[0]?.reasons.some((reason) => reason.includes("matched requested restaurant terms: lobster ravioli"))).toBe(false);
    expect(scored.restaurants[1]?.reasons).toContain("broad restaurant fallback without dish-specific evidence");
  });
});
