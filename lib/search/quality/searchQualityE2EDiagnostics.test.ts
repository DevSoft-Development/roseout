import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildQueryFailureReport, evaluateReplayCase } from "@/app/api/admin/search-quality/replay/route";

const read = (path: string) => readFileSync(path, "utf8");

describe("search quality E2E diagnostics and domain isolation", () => {
  it("keeps restaurant and activity candidates in separate retrieval lanes", () => {
    const source = read("lib/search/v2/retrieval/retrieveCandidates.ts");
    expect(source).toContain("const byLaneAndId");
    expect(source).toContain("`${lane}:${String(item.location.id)}`");
    expect(source).not.toContain("const byId = new Map");
  });

  it("reports actionable pairing eligibility reasons", () => {
    const source = read("lib/search/v2/pairing/buildPairs.ts");
    expect(source).toContain('stage: "pairing_eligibility"');
    expect(source).toContain('"no_restaurant_candidates"');
    expect(source).toContain('"no_activity_candidates"');
    expect(source).toContain('"distance_rejection"');
    expect(source).toContain('"missing_coordinates"');
    expect(source).toContain('"low_quality_suppression"');
  });

  it("builds a query-level failure report with the required fields", () => {
    const strict = {
      restaurants: [{ id: "r1" }],
      activities: [],
      pairs: [],
      debug: {
        retrievalCalls: [
          { role: "restaurant", domain: "restaurant", retrievalTerms: ["steak"], reason: "canonical_profile_primary_retrieval", resultCount: 1 },
          { role: "bowling_activity", domain: "activity", retrievalTerms: ["bowling"], reason: "canonical_profile_strict_empty", resultCount: 0 },
        ],
        decisions: [{ stage: "pairing_eligibility", reason: JSON.stringify({ restaurantCandidates: 1, activityCandidates: 0, validPairs: 0, primaryFailure: "no_activity_candidates" }) }],
      },
    };
    const canonical = { ...strict, retrieval: { legacyFallbackUsed: true, fallbackDomains: ["activity"] } };
    const query = { query: "steak dinner and bowling after", expectations: { expectedDomains: ["restaurant", "activity"], minimumPairs: 1 } };
    const comparison = evaluateReplayCase(query, { restaurants: [{ id: "legacy" }] }, canonical, strict);
    const report = buildQueryFailureReport(query, canonical, strict, comparison);
    expect(report).toMatchObject({
      query: query.query,
      expectedDomains: ["restaurant", "activity"],
      parsedDomains: ["restaurant", "activity"],
      returnedDomains: ["restaurant"],
      fallbackReason: "canonical profile empty for: activity",
      pairResult: { primaryFailure: "no_activity_candidates" },
      passed: false,
    });
    expect(report.profileTerms).toEqual({ restaurant: ["steak"], activity: ["bowling"] });
  });

  it("preserves the golden suite and launch thresholds", () => {
    const replay = read("app/api/admin/search-quality/replay/route.ts");
    const gates = read("lib/search/quality/launchGates.ts");
    expect(replay).toContain("let cases: any[] = GOLDEN_SEARCH_QUERIES");
    expect(replay).toContain("goldenQueryCount");
    expect(gates).toContain("target: 99.5");
    expect(gates).toContain("target: 2");
    expect(gates).toContain("target: 85");
    expect(gates).toContain("target: 10");
  });
});
