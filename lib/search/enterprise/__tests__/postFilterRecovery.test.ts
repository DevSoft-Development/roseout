import { describe, expect, it, vi } from "vitest";
import { recoverPostFilterSearchResult } from "../postFilterRecovery";

function baseResult(overrides: Record<string, any> = {}) {
  return {
    success: true,
    reply: "ok",
    restaurants: [],
    activities: [],
    pairs: [],
    card_counts: { restaurants: 0, activities: 0, pairs: 0 },
    cardCounts: { restaurants: 0, activities: 0, pairs: 0 },
    debug: {},
    ...overrides,
  } as any;
}

const restaurant = (id: string) => ({
  id,
  location_type: "restaurant",
  name: `Restaurant ${id}`,
  restaurant_name: `Restaurant ${id}`,
});

const activity = (id: string) => ({
  id,
  location_type: "activity",
  name: `Activity ${id}`,
  activity_name: `Activity ${id}`,
});

describe("recoverPostFilterSearchResult", () => {
  it("recovers an ordinary weak activity lane after filtering", async () => {
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
    expect(result.activities).toHaveLength(3);
    expect(result.debug.postFilterRecoveryAttempted).toBe(true);
    expect(result.debug.postFilterRecoveryLane).toBe("activity");
    expect(result.debug.recoveryAttempts[0].stage).toBe("post_filter_viability");
  });

  it("recovers a named-anchor restaurant result with anchor coordinates", async () => {
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

    expect(runRecoverySearch).toHaveBeenCalledTimes(1);
    expect(runRecoverySearch.mock.calls[0][0].userLocation.radiusMiles).toBeGreaterThanOrEqual(12);
    expect(result.restaurants).toHaveLength(3);
    expect(result.debug.postFilterRecoveryLane).toBe("restaurant");
  });

  it("targets the weaker lane when both lanes are required", async () => {
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
    expect(result.activities).toHaveLength(3);
  });

  it("runs a second pass and merges recovered pairs when both lanes exist but pairing failed", async () => {
    const r1 = restaurant("r1");
    const a1 = activity("a1");
    const recoveredPair = {
      restaurant: r1,
      activity: a1,
      score: 90,
      pairScore: 90,
    };
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
    expect(result.pairs).toHaveLength(1);
    expect(result.primaryResultType).toBe("pairs");
    expect(result.debug.recoveryAttempts[0].stage).toBe("pair_recovery");
    expect(result.debug.recoveryAttempts[0].maxPairDistanceMiles).toBeGreaterThanOrEqual(3);
  });

  it("does not recurse when the request is already a recovery pass", async () => {
    const runRecoverySearch = vi.fn();
    const original = baseResult({
      activities: [],
      debug: { needsActivity: true },
    });

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
