import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("adaptive pairing and QA performance telemetry", () => {
  it("does not permanently limit pairing eligibility to the top twenty candidates", () => {
    const source = read("lib/search/v2/pairing/buildPairs.ts");
    expect(source).not.toContain("restaurants.slice(0,20)");
    expect(source).not.toContain("activities.slice(0,20)");
    expect(source).toContain("adaptive");
  });

  it("does not evaluate pairs when either final eligible lane is empty", () => {
    const source = read("lib/search/v2/pairing/buildPairs.ts");
    expect(source).toContain("insufficient_domain_candidates");
    expect(source).toMatch(/if\s*\([^)]*!restaurants\.length[^)]*\|\|[^)]*!activities\.length[^)]*\)/);
  });

  it("exports every V2 stage timing through batch QA", () => {
    const source = read("app/api/admin/search-health/batch-run/route.ts");
    for (const field of [
      "intent_parse_ms",
      "restaurant_retrieval_ms",
      "activity_retrieval_ms",
      "pairing_ms",
      "ranking_ms",
      "response_adaptation_ms",
    ]) expect(source).toContain(field);
  });

  it("exports pairing frontier diagnostics", () => {
    const source = read("app/api/admin/search-health/batch-run/route.ts");
    for (const field of [
      "theoreticalPairCandidates",
      "pairCandidatesEvaluated",
      "pairCandidatesSkipped",
      "shortCircuitApplied",
      "shortCircuitReason",
      "adaptiveExpansionApplied",
      "adaptiveRestaurantLimit",
      "adaptiveActivityLimit",
    ]) expect(source).toContain(field);
  });
});
