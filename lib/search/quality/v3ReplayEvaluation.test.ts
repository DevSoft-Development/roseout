import { describe, expect, it } from "vitest";
import {
  createEmptyLocationIntelligenceProfile,
  type SearchCandidate,
  type SearchOuting,
  type SearchV3Execution,
} from "@/lib/search-framework";
import type { GoldenQueryCase } from "./goldenQueries";
import {
  buildV3ReplayMetrics,
  evaluateV3Execution,
} from "./v3ReplayEvaluation";

describe("Search V3 replay evaluation", () => {
  it("requires a real relevant outing for paired golden queries", () => {
    const restaurant = candidate("restaurant", "restaurant", {
      borough: "Queens",
      cuisines: ["italian"],
      mealPeriods: ["dinner"],
    });
    const activity = candidate("activity", "activity", {
      borough: "Queens",
      activityCategories: ["bowling"],
    });
    const testCase = pairedCase();

    const result = evaluateV3Execution(
      testCase,
      execution(
        [restaurant, activity],
        [outing(restaurant, activity, { distanceMiles: 0.7 })],
      ),
      { legacyCount: 2, latencyMs: 120 },
    );

    expect(result.passed).toBe(true);
    expect(result.minimumPairsPass).toBe(true);
    expect(result.pairRelevancePass).toBe(true);
    expect(result.pairDistancePass).toBe(true);
    expect(result.pairSequencingPass).toBe(true);
    expect(result.pairCount).toBe(1);
  });

  it("does not treat restaurant plus activity candidates as a successful pair by themselves", () => {
    const restaurant = candidate("restaurant", "restaurant", { borough: "Queens" });
    const activity = candidate("activity", "activity", {
      borough: "Queens",
      activityCategories: ["bowling"],
    });

    const result = evaluateV3Execution(
      pairedCase(),
      execution([restaurant, activity], []),
      { legacyCount: 2, latencyMs: 100 },
    );

    expect(result.servedDomains).toEqual(["activity", "restaurant"]);
    expect(result.exactDomainCoveragePass).toBe(true);
    expect(result.minimumPairsPass).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("does not count secondary supported domains as served-domain leakage", () => {
    const restaurant = candidate("restaurant", "restaurant", {
      supportedDomains: ["restaurant", "activity"],
    });
    const testCase: GoldenQueryCase = {
      id: "restaurant-only-supported-domain",
      category: "restaurant",
      query: "Dinner in Queens",
      expectations: {
        expectedDomains: ["restaurant"],
        minimumResults: 1,
      },
    };

    const result = evaluateV3Execution(
      testCase,
      execution([restaurant]),
      { legacyCount: 1, latencyMs: 100 },
    );

    expect(result.servedDomains).toEqual(["restaurant"]);
    expect(result.unexpectedDomains).toEqual([]);
    expect(result.exactDomainCoveragePass).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("maps nightlife to activity and accepts it as the activity stop", () => {
    const restaurant = candidate("restaurant", "restaurant");
    const nightlife = candidate("nightlife", "nightlife", {
      activityCategories: ["cocktails"],
    });
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
      execution([restaurant, nightlife], [outing(restaurant, nightlife)]),
      { legacyCount: 2, latencyMs: 100 },
    );

    expect(result.servedDomains).toEqual(["activity", "restaurant"]);
    expect(result.passed).toBe(true);
  });

  it("flags pair distance leakage", () => {
    const restaurant = candidate("restaurant", "restaurant", { borough: "Queens" });
    const activity = candidate("activity", "activity", {
      borough: "Queens",
      activityCategories: ["bowling"],
    });
    const testCase = pairedCase();

    const result = evaluateV3Execution(
      testCase,
      execution(
        [restaurant, activity],
        [outing(restaurant, activity, { distanceMiles: 1.25 })],
      ),
      { legacyCount: 2, latencyMs: 100 },
    );

    expect(result.distanceLeakage).toBe(true);
    expect(result.pairDistancePass).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("flags an explicit sequencing mismatch", () => {
    const restaurant = candidate("restaurant", "restaurant", { borough: "Queens" });
    const activity = candidate("activity", "activity", {
      borough: "Queens",
      activityCategories: ["bowling"],
    });

    const result = evaluateV3Execution(
      pairedCase(),
      execution(
        [restaurant, activity],
        [outing(restaurant, activity, {
          sequence: "activity_then_restaurant",
          distanceMiles: 0.5,
        })],
      ),
      { legacyCount: 2, latencyMs: 100 },
    );

    expect(result.pairSequencingPass).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("requires verified routing for true-walkability golden cases", () => {
    const restaurant = candidate("restaurant", "restaurant", { borough: "Queens" });
    const activity = candidate("activity", "activity", {
      borough: "Queens",
      activityCategories: ["bowling"],
    });
    const testCase: GoldenQueryCase = {
      id: "walk-verified",
      category: "paired",
      query: "Dinner and bowling in Queens within a 20-minute walk",
      expectations: {
        expectedDomains: ["restaurant", "activity"],
        expectedActivityCategories: ["bowling"],
        expectedGeography: ["Queens"],
        minimumPairs: 1,
        maximumTravelMinutes: 20,
        requireVerifiedRoute: true,
      },
    };

    const estimated = evaluateV3Execution(
      testCase,
      execution(
        [restaurant, activity],
        [outing(restaurant, activity, {
          travelMinutes: 15,
          routeConfidence: "estimated",
          travelMode: "walking",
        })],
      ),
      { legacyCount: 2, latencyMs: 100 },
    );

    expect(estimated.pairTravelTimePass).toBe(true);
    expect(estimated.pairRouteVerifiedPass).toBe(false);
    expect(estimated.passed).toBe(false);

    const verified = evaluateV3Execution(
      testCase,
      execution(
        [restaurant, activity],
        [outing(restaurant, activity, {
          travelMinutes: 18,
          routeConfidence: "verified",
          travelMode: "walking",
        })],
      ),
      { legacyCount: 2, latencyMs: 100 },
    );

    expect(verified.pairTravelTimePass).toBe(true);
    expect(verified.pairRouteVerifiedPass).toBe(true);
    expect(verified.passed).toBe(true);
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
      { canonicalPassed: true, v3: comparison(true) },
      { canonicalPassed: false, v3: comparison(true) },
      { canonicalPassed: true, v3: comparison(false) },
      { canonicalPassed: false, v3: comparison(false) },
    ]);

    expect(metrics.bothPassCount).toBe(1);
    expect(metrics.v3OnlyPassCount).toBe(1);
    expect(metrics.canonicalOnlyPassCount).toBe(1);
    expect(metrics.bothFailCount).toBe(1);
    expect(metrics.successRate).toBe(50);
  });
});

function pairedCase(): GoldenQueryCase {
  return {
    id: "pair-test",
    category: "paired",
    query: "Italian dinner and bowling in Queens",
    expectations: {
      expectedDomains: ["restaurant", "activity"],
      expectedActivityCategories: ["bowling"],
      expectedGeography: ["Queens"],
      minimumPairs: 1,
      maximumDistanceMiles: 1,
      expectedSequence: "restaurant_then_activity",
    },
  };
}

function execution(
  candidates: SearchCandidate[],
  outings: SearchOuting[] = [],
): SearchV3Execution {
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
    outings,
    trace: [],
    metadata: {
      candidateCount: candidates.length,
      eligibleCount: candidates.length,
      rejectedCount: 0,
      hydratedCount: candidates.length,
      outingCount: outings.length,
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
    supportedDomains?: Array<"restaurant" | "activity" | "nightlife">;
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
      identity: {
        ...base.identity,
        supportedDomains: overrides.supportedDomains ?? base.identity.supportedDomains,
      },
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

function outing(
  restaurant: SearchCandidate,
  activity: SearchCandidate,
  overrides: {
    distanceMiles?: number | null;
    travelMinutes?: number | null;
    travelMode?: SearchOuting["travelMode"];
    routeConfidence?: SearchOuting["metadata"]["routeConfidence"];
    sequence?: SearchOuting["sequence"];
  } = {},
): SearchOuting {
  const distanceMiles = overrides.distanceMiles ?? 0.5;
  const travelMinutes = overrides.travelMinutes ?? (distanceMiles == null ? null : Math.round(distanceMiles * 4));
  const routeConfidence = overrides.routeConfidence ?? "verified";
  return {
    outingId: `${restaurant.locationId}::${activity.locationId}`,
    restaurant,
    activity,
    score: 0.85,
    distanceMiles,
    travelMinutes,
    travelMode: overrides.travelMode ?? "driving",
    sequence: overrides.sequence ?? "restaurant_then_activity",
    reasons: ["test"],
    metadata: {
      pairingProvider: "test",
      scoreComponents: {
        relevance: 0.9,
        proximity: 0.9,
        intent: 0.9,
        quality: 0.8,
        diversity: 1,
      },
      scoreWeights: {
        relevance: 0.4,
        proximity: 0.25,
        intent: 0.2,
        quality: 0.1,
        diversity: 0.05,
      },
      withinTravelLimit: true,
      routeSource: routeConfidence === "verified" ? "mapbox" : "haversine_estimate",
      routeConfidence,
      straightLineMiles: distanceMiles,
      routeDistanceMiles: routeConfidence === "verified" ? distanceMiles : null,
    },
  };
}

function comparison(passed: boolean) {
  return {
    passed,
    resultCount: passed ? 1 : 0,
    pairCount: 0,
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
    minimumPairsPass: true,
    pairRelevancePass: true,
    pairActivityCategoryPass: true,
    pairGeographyPass: true,
    pairDistancePass: true,
    pairTravelTimePass: true,
    pairRouteVerifiedPass: true,
    routeVerificationRequired: false,
    verifiedRouteCoverage: false,
    pairSequencingPass: true,
    distanceLeakage: false,
    travelTimeLeakage: false,
    noResultRegression: false,
    latencyMs: 100,
    candidateDomainCounts: { restaurant: passed ? 1 : 0, activity: 0 },
    topCandidates: [],
    topOutings: [],
  };
}
