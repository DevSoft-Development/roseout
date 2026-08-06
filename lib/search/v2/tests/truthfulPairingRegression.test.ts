import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildSearchPlan } from "../planner/buildSearchPlan";
import { adaptV2ResponseToCurrentPublicContract } from "../response/compatibilityAdapter";

const SAME_VENUE_ALTERNATIVE =
  "I’m planning a special date tonight and need an elegant Italian restaurant in Manhattan that either has live jazz at the same venue or can be paired with a nearby jazz club";

const NO_PAIR_PROMPTS = [
  "Romantic Turkish restaurant with shisha and cocktails in Queens",
  "Lebanese dinner with a hookah lounge nearby in Brooklyn",
  "Find a stylish Mediterranean restaurant for dinner and a real hookah lounge nearby, but do not give me a generic bar or nightclub that does not actually offer hookah",
  "Italian restaurant followed by a rooftop lounge in Brooklyn",
] as const;

function location(id: string, name: string) {
  return { id, name, location_type: "restaurant", status: "approved" };
}

function noPairFixture(query: string) {
  return {
    version: "public-search-v2",
    success: true,
    requestFulfilled: true,
    partialResults: false,
    requestId: "regression-request",
    requestedMode: "paired_outing",
    resolvedMode: "paired_outing",
    primaryDomain: "mixed",
    primary_domain: "mixed",
    displayMode: "restaurant_cards",
    searchPlan: {
      rawQuery: query,
      restaurant: { required: true },
      activity: { required: true },
    },
    restaurants: [location("restaurant-1", "Restaurant")],
    activities: [
      { ...location("activity-1", "Activity"), location_type: "activity" },
    ],
    sameVenueResults: [],
    pairs: [],
    builder: {
      enabled: false,
      restaurants: [],
      activities: [],
      selectedRestaurantId: null,
      selectedActivityId: null,
    },
    anchor: {
      requested: false,
      resolved: false,
      rawName: null,
      relationship: null,
      location: null,
    },
    counts: {
      builderRestaurantCards: 0,
      builderActivityCards: 0,
      uniquePairRestaurants: 0,
      uniquePairActivities: 0,
    },
    fallback: { used: false, reason: null },
    retrieval: {
      configuredMode: "primary",
      servedSource: "canonical_profile",
      profileVersion: 1,
      canaryBucket: null,
      canaryPercent: null,
      profileCandidateCount: 2,
      legacyCandidateCount: 0,
      legacyFallbackUsed: false,
      fallbackDomains: [],
    },
    message: "We found options matching your outing.",
    timing: {},
    ml: {
      enabled: false,
      modelVersion: null,
      rankingVariant: "control",
      configuredVariant: null,
      appliedVariant: "control",
      applied: false,
      shadowOnly: false,
      rolloutBucket: null,
      reason: "disabled",
    },
    debug: {
      candidateStages: {
        finalRestaurantCandidates: 1,
        finalActivityCandidates: 1,
      },
      pairingDebug: { pairCandidatesEvaluated: 1 },
    },
  } as any;
}

describe("truthful final V2 pairing contract", () => {
  it("treats same-venue-or-nearby wording as a preference, not a hard requirement", async () => {
    const plan = await buildSearchPlan({ input: { query: SAME_VENUE_ALTERNATIVE } });

    expect(plan.mode).toBe("paired_outing");
    expect(plan.pairing.sameVenuePreferred).toBe(true);
    expect(plan.pairing.sameVenueRequired).toBe(false);
    expect(plan.fallback.allowNearbyPair).toBe(true);
  });

  it.each(NO_PAIR_PROMPTS)(
    "keeps partial mixed results visible without claiming fulfillment: %s",
    (query) => {
      const result = adaptV2ResponseToCurrentPublicContract(noPairFixture(query));

      expect(result.requestFulfilled).toBe(false);
      expect(result.partialResults).toBe(true);
      expect(result.render_mode).toBe("partial_mixed");
      expect(result.outcome).toBe("no_compatible_pair");
      expect(result.restaurant_count).toBeGreaterThan(0);
      expect(result.activity_count).toBeGreaterThan(0);
      expect(result.pair_count).toBe(0);
    },
  );

  it("keeps both batch JSON copy actions available", () => {
    const source = readFileSync(
      "app/admin/dashboard/search-health/BatchQaRunner.tsx",
      "utf8",
    );

    expect(source).toContain("Copy Summary JSON");
    expect(source).toMatch(/Copy (?:Full Batch|All Results) JSON/);
    expect(source).toContain("JSON.stringify(batchResult");
  });
});
