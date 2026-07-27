import { describe, expect, it, vi } from "vitest";
import { recoverPostFilterSearchResult } from "../postFilterRecovery";

function baseResult(overrides: Record<string, any> = {}) {
  return {
    success: true,
    reply: "ok",
    restaurants: [],
    activities: [],
    pairs: [],
    card_counts: { restaurants: 0, activities: 0, pairs: 0, matched_locations: 0 },
    cardCounts: { restaurants: 0, activities: 0, pairs: 0, matched_locations: 0 },
    debug: {},
    ...overrides,
  } as any;
}

const restaurant = (id: string, extra: Record<string, any> = {}) => ({
  id,
  location_type: "restaurant",
  name: `Restaurant ${id}`,
  restaurant_name: `Restaurant ${id}`,
  latitude: 40.75,
  longitude: -73.98,
  ...extra,
});

const activity = (id: string, extra: Record<string, any> = {}) => ({
  id,
  location_type: "activity",
  name: `Activity ${id}`,
  activity_name: `Activity ${id}`,
  latitude: 40.76,
  longitude: -73.97,
  ...extra,
});

describe("recoverPostFilterSearchResult", () => {
  it("rewrites karaoke recovery and relaxes activity eligibility", async () => {
    const runRecoverySearch = vi.fn().mockResolvedValue(
      baseResult({
        restaurants: [restaurant("r1")],
        activities: [activity("a1"), activity("a2"), activity("a3")],
        debug: { needsRestaurant: true, needsActivity: true, wantsPairing: false },
      }),
    );

    const result = await recoverPostFilterSearchResult({
      result: baseResult({
        restaurants: [restaurant("r1")],
        activities: [],
        debug: { needsRestaurant: true, needsActivity: true, wantsPairing: false },
      }),
      query: "Sushi in Flushing with karaoke after",
      userLocation: null,
      body: {},
      runRecoverySearch,
    });

    expect(runRecoverySearch).toHaveBeenCalledTimes(1);
    expect(runRecoverySearch.mock.calls[0][0].query).toBe("karaoke bar private karaoke karaoke lounge");
    expect(runRecoverySearch.mock.calls[0][0].body.relaxedCandidateEligibility).toBe(true);
    expect(result.activities).toHaveLength(3);
    expect(result.debug.postFilterRecoveryLane).toBe("activity");
    expect(result.debug.postFilterRecoveryRewrittenQuery).toContain("karaoke");
  });

  it("recovers a named-anchor restaurant result and synchronizes result counts", async () => {
    const runRecoverySearch = vi.fn().mockResolvedValue(
      baseResult({
        restaurants: [restaurant("r1"), restaurant("r2"), restaurant("r3")],
        debug: { needsRestaurant: true, needsActivity: false, wantsPairing: false },
      }),
    );

    const result = await recoverPostFilterSearchResult({
      result: baseResult({
        restaurants: [],
        counts: { restaurants: 0, activities: 0, pairs: 0, cards: 0 },
        searchPerformance: { resultCount: 0 },
        debug: {
          needsRestaurant: true,
          needsActivity: false,
          wantsPairing: false,
          geoSource: "named_location_anchor",
          performance: { result_count: 0 },
          debugParity: { resultCounts: { restaurants: 0, activities: 0, pairs: 0, cards: 0 } },
        },
      }),
      query: "Seafood restaurant near the Paramount in Huntington",
      userLocation: {
        latitude: 40.8682,
        longitude: -73.4257,
        radiusMiles: 3,
        label: "The Paramount",
      },
      body: { namedAnchor: { name: "The Paramount" } },
      runRecoverySearch,
    });

    expect(result.restaurants).toHaveLength(3);
    expect(result.result_count).toBe(3);
    expect(result.restaurantCount).toBe(3);
    expect(result.activityCount).toBe(0);
    expect(result.cardCount).toBe(3);
    expect(result.counts).toEqual({ restaurants: 3, activities: 0, pairs: 0, cards: 3 });
    expect(result.debug.performance.result_count).toBe(3);
    expect(result.debug.debugParity.resultCounts.restaurants).toBe(3);
    expect(result.searchPerformance.resultCount).toBe(3);
    expect(result.status).toBe("success");
  });

  it("promotes restaurant-typed sports bars into the activity lane", async () => {
    const sportsBar = restaurant("sports", {
      name: "Harlem Sports Pub",
      search_keywords: ["sports bar", "tvs", "live sports", "watch party"],
    });
    const runRecoverySearch = vi.fn().mockResolvedValue(
      baseResult({
        restaurants: [sportsBar],
        activities: [],
        debug: { needsRestaurant: false, needsActivity: true, wantsPairing: false },
      }),
    );

    const result = await recoverPostFilterSearchResult({
      result: baseResult({
        activities: [],
        debug: { needsRestaurant: false, needsActivity: true, wantsPairing: false },
      }),
      query: "Best bar to watch the Knicks game in Harlem",
      userLocation: null,
      body: {},
      runRecoverySearch,
    });

    expect(result.activities.map((row: any) => row.id)).toContain("sports");
    expect(result.activityCount).toBe(1);
    expect(result.primaryResultType).toBe("activity_cards");
  });

  it("reruns pairing after recovered candidates are merged", async () => {
    const r1 = restaurant("r1", { latitude: 40.7500, longitude: -73.9800 });
    const a1 = activity("a1", { latitude: 40.7510, longitude: -73.9790 });
    const runRecoverySearch = vi.fn().mockResolvedValue(
      baseResult({
        restaurants: [r1],
        activities: [a1],
        pairs: [],
        debug: { needsRestaurant: true, needsActivity: true, wantsPairing: true },
      }),
    );

    const result = await recoverPostFilterSearchResult({
      result: baseResult({
        restaurants: [r1],
        activities: [],
        pairs: [],
        debug: { needsRestaurant: true, needsActivity: true, wantsPairing: true },
      }),
      query: "Sushi in Flushing with karaoke after",
      userLocation: null,
      body: {},
      runRecoverySearch,
    });

    expect(result.pairs).toHaveLength(1);
    expect(result.debug.postFilterRecoveryRegeneratedPairCount).toBe(1);
    expect(result.primaryResultType).toBe("pairs");
    expect(result.renderMode).toBe("pairs");
  });

  it("runs pair-only recovery when both lanes exist without a pair", async () => {
    const r1 = restaurant("r1", { latitude: 40.741, longitude: -73.949 });
    const a1 = activity("a1", { latitude: 40.742, longitude: -73.948 });
    const runRecoverySearch = vi.fn().mockResolvedValue(
      baseResult({
        restaurants: [r1],
        activities: [a1],
        pairs: [],
        debug: { needsRestaurant: true, needsActivity: true, wantsPairing: true },
      }),
    );

    const result = await recoverPostFilterSearchResult({
      result: baseResult({
        restaurants: [r1, restaurant("r2"), restaurant("r3")],
        activities: [a1, activity("a2"), activity("a3")],
        pairs: [],
        debug: {
          needsRestaurant: true,
          needsActivity: true,
          wantsPairing: true,
          pairingPreference: { maxPairDistanceMiles: 1 },
        },
      }),
      query: "Casual dinner and a relaxed activity in Long Island City",
      userLocation: null,
      body: {},
      runRecoverySearch,
    });

    expect(runRecoverySearch).toHaveBeenCalledTimes(1);
    expect(runRecoverySearch.mock.calls[0][0].body.forcePairingRecovery).toBe(true);
    expect(result.debug.postFilterRecoveryStage).toBe("pair_recovery");
    expect(result.pairs.length).toBeGreaterThan(0);
  });

  it("falls back from strict rooftop same-venue search to a nearby pair", async () => {
    const steakhouse = restaurant("steak", {
      name: "Midtown Steakhouse",
      search_keywords: ["steakhouse"],
      latitude: 40.7500,
      longitude: -73.9800,
      borough: "Manhattan",
    });
    const rooftop = activity("roof", {
      name: "Skyline Rooftop",
      search_keywords: ["rooftop", "skyline views"],
      latitude: 40.7510,
      longitude: -73.9790,
      borough: "Manhattan",
    });
    const runRecoverySearch = vi.fn().mockResolvedValue(
      baseResult({
        restaurants: [steakhouse],
        activities: [rooftop],
        pairs: [],
        debug: { needsRestaurant: true, needsActivity: true, wantsPairing: true },
      }),
    );

    const result = await recoverPostFilterSearchResult({
      result: baseResult({
        restaurants: [restaurant("false-positive", { search_keywords: ["bar", "steakhouse"] })],
        activities: [],
        pairs: [],
        sameLocationRequired: true,
        debug: {
          needsRestaurant: true,
          needsActivity: false,
          wantsPairing: false,
          sameLocationRequired: true,
          normalizedIntent: { sameLocationRequired: true },
        },
      }),
      query: "Steak dinner and rooftop drinks in Manhattan",
      userLocation: null,
      body: {},
      runRecoverySearch,
    });

    expect(runRecoverySearch).toHaveBeenCalledTimes(2);
    expect(runRecoverySearch.mock.calls.map((call) => call[0].query)).toEqual([
      "steakhouse steak restaurant dinner",
      "rooftop bar roof deck skyline terrace city views",
    ]);
    expect(runRecoverySearch.mock.calls[1][0].body.sameVenueFallbackToNearbyPair).toBe(true);
    expect(result.pairs).toHaveLength(1);
    expect(result.fallbackMode).toBe("nearby_pair_after_strict_same_venue_rooftop_miss");
    expect(result.sameLocationRequired).toBe(false);
    expect(result.fallbackPairsUsedAsPrimary).toBe(true);
  });

  it("does not recurse when the request is already a recovery pass", async () => {
    const runRecoverySearch = vi.fn();
    const original = baseResult({ activities: [], debug: { needsActivity: true } });

    const result = await recoverPostFilterSearchResult({
      result: original,
      query: "sports bar",
      userLocation: null,
      body: { postFilterRecoveryPass: 2 },
      runRecoverySearch,
    });

    expect(result).toBe(original);
    expect(runRecoverySearch).not.toHaveBeenCalled();
  });
});
