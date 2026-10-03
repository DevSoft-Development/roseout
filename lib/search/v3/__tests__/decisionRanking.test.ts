import { describe, expect, it } from "vitest";
import {
  createEmptyLocationIntelligenceProfile,
  type SearchCandidate,
  type SearchIntentGraph,
  type SearchRankingProvider,
} from "@/lib/search-framework";
import {
  DeterministicDecisionRankingProvider,
  createTheOutHavenSearchV3,
} from "@/lib/search/v3";

const intent: SearchIntentGraph = {
  contractVersion: "search-intent-v3-alpha.1",
  rawQuery: "romantic Italian dinner in Queens",
  domains: ["restaurant"],
  primaryDomain: "restaurant",
  constraints: [
    {
      key: "cuisine",
      value: "italian",
      strength: "hard",
      source: "explicit",
      confidence: 1,
    },
    {
      key: "meal_period",
      value: "dinner",
      strength: "hard",
      source: "explicit",
      confidence: 1,
    },
    {
      key: "borough",
      value: "Queens",
      strength: "hard",
      source: "explicit",
      confidence: 1,
    },
  ],
  anchor: null,
  travelMode: "unspecified",
  maxTravelMinutes: null,
  occasion: "date night",
  partySize: 2,
  sequencing: "single",
  ambiguity: { requiresClarification: false, unresolved: [] },
  metadata: {},
};

function candidate(args: {
  id: string;
  cuisine?: string[];
  mealPeriods?: string[];
  borough?: string | null;
  occasions?: string[];
  rrfRank: number;
  rrfScore: number;
  latitude?: number;
  longitude?: number;
}): SearchCandidate {
  const base = createEmptyLocationIntelligenceProfile({
    locationId: args.id,
    name: args.id,
    primaryDomain: "restaurant",
    generatedAt: "2026-10-03T00:00:00.000Z",
  });

  return {
    locationId: args.id,
    intelligence: {
      ...base,
      geo: {
        ...base.geo,
        borough: args.borough ?? null,
        point:
          args.latitude != null && args.longitude != null
            ? { latitude: args.latitude, longitude: args.longitude }
            : null,
      },
      taxonomy: {
        ...base.taxonomy,
        cuisines: args.cuisine ?? [],
        mealPeriods: args.mealPeriods ?? [],
        occasions: args.occasions ?? [],
      },
      quality: {
        ...base.quality,
        confidence: 0.9,
      },
    },
    retrieval: [{
      locationId: args.id,
      lane: "rrf",
      rank: args.rrfRank,
      score: args.rrfScore,
    }],
    frameworkScore: null,
    finalRank: null,
    metadata: {},
  };
}

describe("Search V3 deterministic decision ranking", () => {
  it("promotes candidates that combine retrieval consensus with explicit intent match", async () => {
    const ranker = new DeterministicDecisionRankingProvider();

    const strong = candidate({
      id: "strong",
      cuisine: ["italian"],
      mealPeriods: ["dinner"],
      borough: "Queens",
      occasions: ["date night"],
      rrfRank: 2,
      rrfScore: 0.04,
    });
    const lexicalOnly = candidate({
      id: "lexical-only",
      cuisine: ["american"],
      mealPeriods: ["dinner"],
      borough: "Queens",
      rrfRank: 1,
      rrfScore: 0.045,
    });

    const ranked = await ranker.rank({
      request: { requestId: "rank-intent", query: intent.rawQuery },
      intent,
      candidates: [lexicalOnly, strong],
    });

    expect(ranked[0].locationId).toBe("strong");
    expect(ranked[0].frameworkScore).toBeGreaterThan(
      ranked[1].frameworkScore ?? 0,
    );
    expect(ranked[0].metadata.ranking).toMatchObject({
      provider: "search-v3.deterministic-decision-ranker.v1",
    });
  });

  it("uses distance as a soft ranking signal when user location is available", async () => {
    const ranker = new DeterministicDecisionRankingProvider({
      retrievalWeight: 0,
      intentWeight: 0,
      geoWeight: 1,
      qualityWeight: 0,
    });

    const nearby = candidate({
      id: "nearby",
      cuisine: ["italian"],
      mealPeriods: ["dinner"],
      borough: "Queens",
      rrfRank: 2,
      rrfScore: 0.03,
      latitude: 40.755,
      longitude: -73.87,
    });
    const farther = candidate({
      id: "farther",
      cuisine: ["italian"],
      mealPeriods: ["dinner"],
      borough: "Queens",
      rrfRank: 1,
      rrfScore: 0.04,
      latitude: 40.68,
      longitude: -73.7,
    });

    const ranked = await ranker.rank({
      request: {
        requestId: "rank-geo",
        query: intent.rawQuery,
        userLocation: { latitude: 40.75, longitude: -73.87 },
      },
      intent,
      candidates: [farther, nearby],
    });

    expect(ranked[0].locationId).toBe("nearby");
  });

  it("keeps ranking provider replaceable in the production composition", () => {
    const customRanking: SearchRankingProvider = {
      providerId: "experiment.ranker.v1",
      async rank({ candidates }) {
        return candidates;
      },
    };

    const composition = createTheOutHavenSearchV3(
      {
        from() {
          throw new Error("database should not be touched during composition");
        },
        async rpc() {
          throw new Error("rpc should not be touched during composition");
        },
      },
      {
        ranking: customRanking,
        retrievalProviders: [{
          providerId: "test.retrieval",
          async retrieve() {
            return { lane: "test", candidates: [], elapsedMs: 0 };
          },
        }],
        entityResolution: null,
        eligibility: null,
        fusion: null,
        locationIntelligence: {
          providerId: "test.location-intelligence",
          async getLocation() {
            return null;
          },
          async getLocations() {
            return [];
          },
        },
      },
    );

    expect(composition.orchestrator).toBeDefined();
  });
});
