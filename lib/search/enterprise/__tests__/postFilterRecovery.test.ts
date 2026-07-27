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
        debug: {
          needsRestaurant: true,
          needsActivity: false,
          wantsPairing: false,
          geoSource: "named_location_anchor",
          performance: { result_count: 0 },
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

    expect(runRecoverySearch.mock.calls[0][0].userLocation.radiusMiles).toBeGreaterThanOrEqual(12);
    expect(result.restaurants).toHaveLength(3);
    expect(result.result_count).toBe(3);
    expect(result.debug.performance.result_count).toBe(3);
    expect(result.card_counts.restaurants).toBe(3);
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

    expect(runRecoverySearch.mock.calls[0][0].query).toContain("sports bar");
    expect(runRecoverySearch.mock.calls[0][0].body.allowRestaurantTypedActivityRecovery).toBe(true);
    expect(result.activities.map((row: any) => row.id)).toContain("sports");
    expect(result.debug.postFilterRecoveryPromotedRestaurantTypedActivities).toBe(1);
  });

  it("targets the weaker hookah lane with a hookah-specific query", async () => {
    const runRecoverySearch = vi.fn().mockResolvedValue(
      baseResult({
        restaurants: [restaurant("r1"), restaurant("r2"), restaurant("r3")],
        activities: [activity("a1"), activity("a2"), activity("a3")],
        debug: { needsRestaurant: true, needsActivity: true, wantsPairing: true },
      }),
    );

    const result = await recoverPostFilterSearchResult({
      result: baseResult({
        restaurants: [restaurant("r1"), restaurant("r2"), restaurant("r3")],
        activities: [activity("a1")],
        debug: { needsRestaurant: true, needsActivity: true, wantsPairing: true },
      }),
      query: "Restaurant with hookah lounge after in Queens",
      userLocation: null,
      body: {},
      runRecoverySearch,
    });

    expect(result.debug.postFilterRecoveryLane).toBe("activity");
    expect(runRecoverySearch.mock.calls[0][0].query).toBe("hookah lounge hookah bar shisha lounge");
    expect(result.activities).toHaveLength(3);
  });

  it("centers pair recovery on an existing opposite-lane candidate", async () => {
    const r1 = restaurant("r1", { latitude: 40.741, longitude: -73.949 });
    const a1 = activity("a1", { latitude: 40.748, longitude: -73.944 });
    const recoveredPair = { restaurant: r1, activity: a1, score: 90, pairScore: 90 };
    const runRecoverySearch = vi.fn().mockResolvedValue(
      baseResult({
        restaurants: [r1],
        activities: [a1],
        pairs: [recoveredPair],
        debug: { needsRestaurant: true, needsActivity: true, wantsPairing: true },
      }),
    );

    const result = await recoverPostFilterSearchResult({
      result: baseResult({
        restaurants: [r1, restaurant("r2"), restaurant("r3")],
        activities: [a1, activity("a2"), activity("a3")],
        pairs: [],
        primaryResultType: "partial_mixed",
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
    expect(runRecoverySearch.mock.calls[0][0].userLocation.latitude).toBe(r1.latitude);
    expect(runRecoverySearch.mock.calls[0][0].body.recoveryMaxPairDistanceMiles).toBeGreaterThanOrEqual(3);
    expect(result.pairs).toHaveLength(1);
    expect(result.primaryResultType).toBe("pairs");
    expect(result.debug.recoveryAttempts[0].centeredOn).toBe("restaurant");
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
