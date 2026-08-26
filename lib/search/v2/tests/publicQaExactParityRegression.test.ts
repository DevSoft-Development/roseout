import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  queryAllowsSameVenue,
  validateModeAgainstQuery,
} from "@/lib/search/contracts/searchContract";

const batchQaRouteSource = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/search-health/batch-run/route.ts"),
  "utf8",
);

describe("public Batch QA exact parity", () => {
  it("recognizes modifier-first same-venue restaurant language", () => {
    expect(queryAllowsSameVenue("hookah restaurant in Forest Hills")).toBe(true);
    expect(queryAllowsSameVenue("restaurant with hookah in Forest Hills")).toBe(true);
    expect(queryAllowsSameVenue("restaurant then hookah in Forest Hills")).toBe(false);
  });

  it("accepts the canonical SearchPlan relationship as same-venue evidence", () => {
    const contract = validateModeAgainstQuery({
      query: "hookah restaurant in Forest Hills",
      mode: "same_venue",
      needsRestaurant: true,
      needsActivity: true,
      relationshipType: "same_venue_required",
    });

    expect(contract.valid).toBe(true);
    expect(contract.sameVenueAllowed).toBe(true);
  });

  it("sends only the normal free-text public search input", () => {
    expect(batchQaRouteSource).toContain('body: JSON.stringify({ input: query })');
    expect(batchQaRouteSource).toContain('parityContract: "public_free_text_exact"');
    expect(batchQaRouteSource).toContain('getIdentity: async () => ({ user: null');
    expect(batchQaRouteSource).not.toContain("qaPublicParity: true");
    expect(batchQaRouteSource).not.toContain("betaDebug: true");
    expect(batchQaRouteSource).not.toContain("searchHealthDebug: true");
    expect(batchQaRouteSource).not.toContain('selectedSearchLane: "auto"');
  });

  it("does not treat a failed QA assertion as a failed batch execution", () => {
    expect(batchQaRouteSource).toContain("ok: true, executionSucceeded: true, allPassed: failedCount === 0");
  });
});
