import { beforeEach, describe, expect, it } from "vitest";
import { hydrateRuntimeTaxonomy, runtimeEligibleRoles, runtimeRetrievalTerms, runtimeTaxonomyStatus } from "./runtimeTaxonomy";

function fakeSupabase(rows: any[]) {
  const chain: any = {
    select: () => chain,
    order: async () => ({ data: rows, error: null }),
  };
  return { from: () => chain } as any;
}

describe("database-backed runtime taxonomy", () => {
  beforeEach(async () => {
    await hydrateRuntimeTaxonomy(fakeSupabase([
      {
        canonical_term: "escape_room",
        domain: "activity",
        term_type: "activity_category",
        aliases: ["escape room", "escape-room"],
        eligible_roles: ["escape_room_activity"],
        retrieval_terms: ["escape room", "escape games", "puzzle room"],
        evidence_rules: ["categories", "primary_category"],
        related_terms: [],
        negative_terms: [],
        incompatible_domains: [],
        audience_restrictions: [],
        version: 2,
      },
      {
        canonical_term: "rooftop",
        domain: "feature",
        term_type: "feature",
        aliases: ["rooftop", "roof deck"],
        eligible_roles: ["restaurant", "lounge_activity"],
        retrieval_terms: ["rooftop", "roof deck", "rooftop lounge"],
        evidence_rules: ["features"],
        related_terms: [],
        negative_terms: [],
        incompatible_domains: [],
        audience_restrictions: [],
        version: 2,
      },
    ]), true);
  });

  it("loads retrieval terms from the database", () => {
    expect(runtimeRetrievalTerms("escape_room")).toContain("puzzle room");
  });

  it("loads eligible roles from the database", () => {
    expect(runtimeEligibleRoles("rooftop")).toEqual(["restaurant", "lounge_activity"]);
  });

  it("reports database source after hydration", () => {
    expect(runtimeTaxonomyStatus()).toMatchObject({ source: "database", termCount: 2 });
  });
});
