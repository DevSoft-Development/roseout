import { describe, expect, it, vi } from "vitest";
import { buildSearchPlan } from "../../planner/buildSearchPlan";
import { buildRetrievalRequests } from "../../retrieval/buildRetrievalRequests";
import { hydrateLegacyRestaurantMenuEvidence } from "../../retrieval/hydrateLegacyMenuEvidence";
import { candidateFrom } from "../../retrieval/retrieveCandidates";
import { assignCandidateRoles } from "../../roles/assignCandidateRoles";
import { scoreCandidates } from "../scoreCandidates";

function supabaseWithMenuRows(menuRows: Array<{ id: string; signature_items: string[] }>) {
  const inMock = vi.fn().mockResolvedValue({ data: menuRows, error: null });
  const selectMock = vi.fn(() => ({ in: inMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return { client: { from: fromMock } as any, fromMock, selectMock, inMock };
}

async function recoverAndScore(
  query: string,
  legacyRows: Record<string, unknown>[],
  menuRows: Array<{ id: string; signature_items: string[] }>,
) {
  const plan = await buildSearchPlan({ input: { query } });
  const request = buildRetrievalRequests(plan).find((item) => item.desiredRole === "restaurant");
  expect(request).toBeDefined();

  const supabase = supabaseWithMenuRows(menuRows);
  const hydrated = await hydrateLegacyRestaurantMenuEvidence({
    supabase: supabase.client,
    request: request!,
    rows: legacyRows,
  });
  const candidates = hydrated.map((row) => candidateFrom(
    {
      location_type: "restaurant",
      rating: 4.5,
      review_count: 200,
      quality_score: 85,
      city: "Long Island City",
      state: "NY",
      borough: "Queens",
      latitude: 40.7447,
      longitude: -73.9485,
      ...row,
    },
    request!,
    "enterprise_search_locations",
    plan,
  ));
  const qualified = assignCandidateRoles({ plan, candidates });
  const scored = await scoreCandidates({ plan, candidates: qualified });
  return { scored, supabase };
}

describe("legacy recovery exact menu ranking", () => {
  it("restores signature_items before scoring so the exact authored dish wins", async () => {
    const { scored, supabase } = await recoverAndScore(
      "farfalle cacio e pepe in Queens",
      [
        { id: "maiella", name: "Maiella" },
        { id: "american-brass", name: "American Brass" },
      ],
      [
        { id: "maiella", signature_items: ["cacio e pepe", "farfalle primavera"] },
        { id: "american-brass", signature_items: ["wild mushroom tagliatelle", "farfalle cacio e pepe"] },
      ],
    );

    expect(supabase.fromMock).toHaveBeenCalledWith("locations");
    expect(supabase.selectMock).toHaveBeenCalledWith("id,signature_items");
    expect(scored.restaurants[0]?.candidate.candidate.location.id).toBe("american-brass");
    expect(scored.restaurants[0]?.reasons).toContain("exact menu phrase match +8: farfalle cacio e pepe");
  });

  it("does not create a false exact match from separate menu items", async () => {
    const { scored } = await recoverAndScore(
      "lobster ravioli in Queens",
      [
        { id: "split-evidence", name: "Split Evidence Italian" },
        { id: "broad-seafood", name: "Broad Seafood Place" },
      ],
      [
        { id: "split-evidence", signature_items: ["lobster bisque", "cheese ravioli"] },
        { id: "broad-seafood", signature_items: ["lobster", "seafood pasta"] },
      ],
    );

    expect(scored.restaurants.length).toBeGreaterThan(0);
    for (const candidate of scored.restaurants) {
      expect(candidate.reasons.some((reason) => reason.startsWith("exact menu phrase match"))).toBe(false);
    }
  });

  it("does not hydrate generic one-word restaurant retrievals", async () => {
    const plan = await buildSearchPlan({ input: { query: "sushi in Queens" } });
    const request = buildRetrievalRequests(plan).find((item) => item.desiredRole === "restaurant");
    expect(request).toBeDefined();
    const supabase = supabaseWithMenuRows([]);
    const rows = [{ id: "sushi-one", name: "Sushi One" }];

    const hydrated = await hydrateLegacyRestaurantMenuEvidence({
      supabase: supabase.client,
      request: request!,
      rows,
    });

    expect(hydrated).toBe(rows);
    expect(supabase.fromMock).not.toHaveBeenCalled();
  });
});
