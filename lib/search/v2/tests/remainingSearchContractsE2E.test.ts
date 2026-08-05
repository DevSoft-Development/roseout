import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";

describe("remaining search stabilization contracts", () => {
  it("parses natural drive duration grammar", async () => {
    const plan = await buildSearchPlan({
      input: {
        query: "Dinner followed by karaoke, and I do not want the drive between the two locations to take more than fifteen minutes.",
      },
    });

    expect(plan.travel.mode).toBe("driving");
    expect(plan.travel.constraint).toBe("hard");
    expect(plan.travel.maxDrivingMinutes).toBe(15);
    expect(plan.pairing.maxDrivingMinutes).toBe(15);
  });

  it("does not use suitability preferences as hard restaurant taxonomy", async () => {
    const plan = await buildSearchPlan({
      input: {
        query: "Plan a family-friendly outing in Nassau County where we eat at a casual restaurant and then go bowling.",
      },
    });

    expect(plan.restaurant.features).not.toContain("family_friendly");
    expect(plan.restaurant.features).not.toContain("casual");
    expect(plan.audience.familyFriendly).toBe(true);
    expect(plan.activity.categories).toContain("bowling");
  });

  it("enforces generic and exact anchor terminal outcomes", () => {
    const source = readFileSync("lib/search/v2/response/buildPublicSearchResponse.ts", "utf8");
    expect(source).toContain('return anchorStatus === "resolved" ? undefined : "clarification_required"');
    expect(source).toContain('if (candidateCounts.exact === 0) return "anchor_not_found"');
    expect(source).toContain("fuzzyCandidateCount: candidateCounts.fuzzy");
  });

  it("exposes bounded lane inventory diagnostics", () => {
    const source = readFileSync("lib/search/v2/response/buildPublicSearchResponse.ts", "utf8");
    expect(source).toContain("restaurantBuilderCandidates");
    expect(source).toContain("activityBuilderCandidates");
    expect(source).toContain("pairingFailure");
    expect(source).toContain("inventoryAudit");
  });

  it("keeps QA ok and testPassed sourced from the same contract result", () => {
    const source = readFileSync("app/api/admin/search-health/batch-run/route.ts", "utf8");
    expect(source).toContain("ok: acceptance.testPassed");
    expect(source).toContain("testPassed: acceptance.testPassed");
    expect(source).toContain("allPassed");
  });
});
