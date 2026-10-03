import { describe, expect, it } from "vitest";
import {
  createEmptyLocationIntelligenceProfile,
  type LocationDomain,
  type SearchCandidate,
  type SearchIntentGraph,
  type SearchRoutingProvider,
} from "@/lib/search-framework";
import {
  DeterministicOutingPairingProvider,
} from "@/lib/search/v3";

describe("DeterministicOutingPairingProvider", () => {
  it("forms and scores restaurant + activity outings", async () => {
    const pairer = new DeterministicOutingPairingProvider();
    const restaurant = candidate({
      id: "r1",
      domain: "restaurant",
      latitude: 40.75,
      longitude: -73.99,
      score: 0.9,
      cuisines: ["italian"],
      mealPeriods: ["dinner"],
      borough: "Queens",
    });
    const activity = candidate({
      id: "a1",
      domain: "activity",
      latitude: 40.755,
      longitude: -73.99,
      score: 0.8,
      activityCategories: ["bowling"],
      borough: "Queens",
    });

    const outings = await pairer.pair({
      request: { requestId: "pair-1", query: "Italian dinner and bowling in Queens" },
      intent: intent({
        rawQuery: "Italian dinner and bowling in Queens",
        domains: ["restaurant", "activity"],
        constraints: [
          hard("cuisine", "italian"),
          hard("meal_period", "dinner"),
          hard("activity_type", "bowling"),
          hard("borough", "Queens"),
        ],
      }),
      candidates: [restaurant, activity],
    });

    expect(outings).toHaveLength(1);
    expect(outings[0]).toMatchObject({
      restaurant: { locationId: "r1" },
      activity: { locationId: "a1" },
      sequence: "restaurant_then_activity",
      travelMode: "driving",
    });
    expect(outings[0].score).toBeGreaterThan(0);
    expect(outings[0].score).toBeLessThanOrEqual(1);
    expect(outings[0].distanceMiles).toBeGreaterThan(0);
    expect(outings[0].metadata.scoreComponents.intent).toBeGreaterThan(0.9);

    const weights = Object.values(outings[0].metadata.scoreWeights)
      .reduce((sum, value) => sum + value, 0);
    expect(weights).toBeCloseTo(1, 6);
  });

  it("enforces a 20-minute walk using verified routed duration, not straight-line distance", async () => {
    const routing: SearchRoutingProvider = {
      providerId: "test.walking-matrix",
      async routeMatrix() {
        return {
          providerId: "test.walking-matrix",
          mode: "walking",
          entries: [
            {
              originId: "r1",
              destinationId: "a-good",
              distanceMiles: 1.15,
              durationMinutes: 18,
              source: "mapbox",
              confidence: "verified",
            },
            {
              originId: "r1",
              destinationId: "a-bad",
              distanceMiles: 0.9,
              durationMinutes: 27,
              source: "mapbox",
              confidence: "verified",
            },
          ],
        };
      },
    };
    const pairer = new DeterministicOutingPairingProvider({}, routing);
    const restaurant = candidate({
      id: "r1",
      domain: "restaurant",
      latitude: 40.75,
      longitude: -73.99,
      score: 0.9,
    });
    const good = candidate({
      id: "a-good",
      domain: "activity",
      latitude: 40.76,
      longitude: -73.99,
      score: 0.8,
      activityCategories: ["bowling"],
    });
    const bad = candidate({
      id: "a-bad",
      domain: "activity",
      latitude: 40.755,
      longitude: -73.99,
      score: 0.99,
      activityCategories: ["bowling"],
    });

    const outings = await pairer.pair({
      request: { requestId: "pair-walk", query: "Dinner and bowling within a 20-minute walk" },
      intent: intent({
        rawQuery: "Dinner and bowling within a 20-minute walk",
        domains: ["restaurant", "activity"],
        travelMode: "walking",
        maxTravelMinutes: 20,
        constraints: [hard("activity_type", "bowling")],
      }),
      candidates: [restaurant, bad, good],
    });

    expect(outings).toHaveLength(1);
    expect(outings[0].activity.locationId).toBe("a-good");
    expect(outings[0].distanceMiles).toBeCloseTo(1.15);
    expect(outings[0].travelMinutes).toBe(18);
    expect(outings[0].metadata.routeSource).toBe("mapbox");
    expect(outings[0].metadata.routeConfidence).toBe("verified");
    expect(outings[0].metadata.straightLineMiles).not.toBeNull();
    expect(outings[0].metadata.routeDistanceMiles).toBeCloseTo(1.15);
  });

  it("respects explicit activity-before-dinner sequencing", async () => {
    const pairer = new DeterministicOutingPairingProvider();

    const outings = await pairer.pair({
      request: { requestId: "pair-sequence", query: "Bowling before dinner" },
      intent: intent({
        rawQuery: "Bowling before dinner",
        domains: ["restaurant", "activity"],
        sequencing: "before",
      }),
      candidates: [
        candidate({
          id: "r1",
          domain: "restaurant",
          score: 0.8,
          mealPeriods: ["dinner"],
        }),
        candidate({
          id: "a1",
          domain: "activity",
          score: 0.8,
          activityCategories: ["bowling"],
        }),
      ],
    });

    expect(outings[0]?.sequence).toBe("activity_then_restaurant");
  });

  it("can return a same-venue outing when one venue supports both roles", async () => {
    const pairer = new DeterministicOutingPairingProvider();
    const hybrid = candidate({
      id: "hybrid",
      domain: "restaurant",
      supportedDomains: ["restaurant", "activity"],
      score: 0.9,
      activityCategories: ["live music"],
      mealPeriods: ["dinner"],
    });

    const outings = await pairer.pair({
      request: { requestId: "pair-same", query: "Dinner and live music at the same venue" },
      intent: intent({
        rawQuery: "Dinner and live music at the same venue",
        domains: ["restaurant", "activity"],
        sequencing: "same_venue",
      }),
      candidates: [hybrid],
    });

    expect(outings).toHaveLength(1);
    expect(outings[0]).toMatchObject({
      restaurant: { locationId: "hybrid" },
      activity: { locationId: "hybrid" },
      sequence: "same_venue",
    });
  });

  it("does not pair a single-domain search", async () => {
    const pairer = new DeterministicOutingPairingProvider();

    const outings = await pairer.pair({
      request: { requestId: "single", query: "Italian dinner in Queens" },
      intent: intent({
        rawQuery: "Italian dinner in Queens",
        domains: ["restaurant"],
      }),
      candidates: [
        candidate({ id: "r1", domain: "restaurant", score: 0.9 }),
      ],
    });

    expect(outings).toEqual([]);
  });
});

function hard(key: string, value: string) {
  return {
    key,
    value,
    strength: "hard" as const,
    source: "explicit" as const,
    confidence: 1,
  };
}

function intent(overrides: {
  rawQuery: string;
  domains: Array<"restaurant" | "activity" | "nightlife">;
  constraints?: SearchIntentGraph["constraints"];
  travelMode?: SearchIntentGraph["travelMode"];
  maxTravelMinutes?: number | null;
  sequencing?: SearchIntentGraph["sequencing"];
}): SearchIntentGraph {
  return {
    contractVersion: "search-intent-v3-alpha.1",
    rawQuery: overrides.rawQuery,
    domains: overrides.domains,
    primaryDomain: overrides.domains[0] ?? null,
    constraints: overrides.constraints ?? [],
    anchor: null,
    travelMode: overrides.travelMode ?? "unspecified",
    maxTravelMinutes: overrides.maxTravelMinutes ?? null,
    occasion: null,
    partySize: null,
    sequencing: overrides.sequencing ?? "single",
    ambiguity: { requiresClarification: false, unresolved: [] },
    metadata: {},
  };
}

function candidate(args: {
  id: string;
  domain: LocationDomain;
  supportedDomains?: LocationDomain[];
  latitude?: number;
  longitude?: number;
  score: number;
  cuisines?: string[];
  mealPeriods?: string[];
  activityCategories?: string[];
  nightlifeCategories?: string[];
  features?: string[];
  borough?: string;
}): SearchCandidate {
  const base = createEmptyLocationIntelligenceProfile({
    locationId: args.id,
    name: args.id,
    primaryDomain: args.domain,
    generatedAt: "2026-10-03T00:00:00.000Z",
  });

  return {
    locationId: args.id,
    intelligence: {
      ...base,
      identity: {
        ...base.identity,
        supportedDomains: args.supportedDomains ?? [args.domain],
      },
      geo: {
        ...base.geo,
        point:
          args.latitude != null && args.longitude != null
            ? { latitude: args.latitude, longitude: args.longitude }
            : null,
        borough: args.borough ?? null,
      },
      taxonomy: {
        ...base.taxonomy,
        cuisines: args.cuisines ?? [],
        mealPeriods: args.mealPeriods ?? [],
        activityCategories: args.activityCategories ?? [],
        nightlifeCategories: args.nightlifeCategories ?? [],
        features: args.features ?? [],
      },
      quality: {
        ...base.quality,
        confidence: 0.9,
        overallQuality: 0.8,
      },
    },
    retrieval: [],
    frameworkScore: args.score,
    finalRank: 1,
    metadata: {},
  };
}
