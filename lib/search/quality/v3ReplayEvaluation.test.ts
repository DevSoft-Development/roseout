import { describe, expect, it } from "vitest";
import {
  createEmptyLocationIntelligenceProfile,
  type SearchCandidate,
  type SearchV3Execution,
} from "@/lib/search-framework";
import type { GoldenQueryCase } from "./goldenQueries";
import {
  buildV3ReplayMetrics,
  evaluateV3Execution,
} from "./v3ReplayEvaluation";

describe("Search V3 replay evaluation", () => {
  it("passes a multi-domain query when both required domains are covered", () => {
    const testCase: GoldenQueryCase = {
      id: "pair-test",
      category: "paired",
      query: "Italian dinner and bowling in Queens",
      expectations: {
        expectedDomains: ["restaurant", "activity"],
        expectedGeography: ["Queens"],
        minimumPairs: 1,
      },
    };

    const result = evaluateV3Execution(
      testCase,
      execution([
        candidate("restaurant", "restaurant", {
          borough: "Queens",
          cuisines: ["italian"],
          mealPeriods: ["dinner"],
        }),
        candidate("activity", "activity", {
          borough: "Queens",
          activityCategories: ["bowling"],
        }),
      ]),
      { legacyCount: 2, latencyMs: 120 },
    );

    expect(result.passed).toBe(true);
    expect(result.pairedDomainCoveragePass).toBe(true);
    expect(result.servedDomains).toEqual(["activity", "restaurant"]);
  });

  it("maps nightlife into the legacy activity comparison domain", () => {
    const testCase: GoldenQueryCase = {
      id: "nightlife-test",
      category: "nightlife",
      query: "Girls night dinner with cocktails",
      expectations: {
        expectedDomains: ["restaurant", "activity"],
        minimumPairs: 1,
      },
    };

    const result = evaluateV3Execution(
      testCase,
      execution([
        candidate("restaurant", "restaurant"),
        candidate("nightlife", "nightlife"),
      ]),
      { legacyCount: 2, latencyMs: 100 },
    );

    expect(result.servedDomains).toEqual(["activity", "restaurant"]);
    expect(result.passed).toBe(true);
  });

  it("reports no-result regressions relative to legacy", () => {
    const testCase: GoldenQueryCase = {
      id: "empty-test",
      category: "restaurant",
      query: "Chicken lunch in Astoria",
      expectations: {
        expectedDomains: ["restaurant"],
        minimumResults: 1,
      },
    };

    const result = evaluateV3Execution(
      testCase,
      execution([]),
      { legacyCount: 4, latencyMs: 80 },
    );

    expect(result.noResultRegression).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("tracks V3 versus canonical pass deltas without changing canonical status", () => {
    const metrics = buildV3ReplayMetrics([
      {
        canonicalPassed: true,
        v3: comparison(true),
      },
      {
        canonicalPassed: false,
        v3: comparison(true),
      },
      {
        canonicalPassed: true,
        v3: comparison(false),
      },
      {
        canonicalPassed: false,
        v3: comparison(false),
      },
    ]);

    expect(metrics.bothPassCount).toBe(1);
    expect(metrics.v3OnlyPassCount).toBe(1);
    expect(metrics.canonicalOnlyPassCount).toBe(1);
    expect(metrics.bothFailCount).toBe(1);
    expect(metrics.successRate).toBe(50);
  });
});

function execution(candidates: SearchCandidate[]): SearchV3Execution {
  return {
    contractVersion: "search-execution-v3-alpha.1",
    requestId: "test",
    query: "test",
    intent: {
      contractVersion: "search-intent-v3-alpha.1",
      rawQuery: "test",
      domains: [],
      primaryDomain: null,
      constraints: [],
      anchor: null,
      travelMode: "unspecified",
      maxTravelMinutes: null,
      occasion: null,
      partySize: null,
      sequencing: "single",
      ambiguity: { requiresClarification: false, unresolved: [] },
      metadata: {},
    },
    retrieval: [],
    candidates,
    trace: [],
    metadata: {
      candidateCount: candidates.length,
      eligibleCount: candidates.length,
      rejectedCount: 0,
      hydratedCount: candidates.length,
      orchestrationVersion: "test",
    },
  };
}

function candidate(
  id: string,
  domain: "restaurant" | "activity" | "nightlife",
  overrides: {
    borough?: string;
    cuisines?: string[];
    mealPeriods?: string[];
    activityCategories?: string[];
  } = {},
): SearchCandidate {
  const base = createEmptyLocationIntelligenceProfile({
    locationId: id,
    name: id,
    primaryDomain: domain,
    generatedAt: "2026-10-03T00:00:00.000Z",
  });

  return {
    locationId: id,
    intelligence: {
      ...base,
      geo: {
        ...base.geo,
        borough: overrides.borough ?? null,
      },
      taxonomy: {
        ...base.taxonomy,
        cuisines: overrides.cuisines ?? [],
        mealPeriods: overrides.mealPeriods ?? [],
        activityCategories: overrides.activityCategories ?? [],
      },
    },
    retrieval: [],
    frameworkScore: 0.8,
    finalRank: 1,
    metadata: {},
  };
}

function comparison(passed: boolean) {
  return {
    passed,
    resultCount: passed ? 1 : 0,
    expectedDomains: ["restaurant"],
    servedDomains: passed ? ["restaurant"] : [],
    missingDomains: passed ? [] : ["restaurant"],
    unexpectedDomains: [],
    exactDomainCoveragePass: passed,
    minimumResultsPass: passed,
    geographyPass: true,
    restaurantTermsPass: true,
    prohibitedCategoriesPass: true,
    pairedDomainCoveragePass: true,
    noResultRegression: false,
    latencyMs: 100,
    candidateDomainCounts: { restaurant: passed ? 1 : 0, activity: 0 },
    topCandidates: [],
  };
}
