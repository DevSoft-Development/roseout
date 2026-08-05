import { describe, expect, it } from "vitest";
import { finalizePublicSearchPayload } from "../finalizePayload";

const restaurant = (id: string, extra: Record<string, any> = {}) => ({
  id,
  location_type: "restaurant",
  name: `Restaurant ${id}`,
  restaurant_name: `Restaurant ${id}`,
  latitude: 40.75,
  longitude: -73.98,
  borough: "Manhattan",
  city: "New York",
  state: "NY",
  ...extra,
});

const activity = (id: string, extra: Record<string, any> = {}) => ({
  id,
  location_type: "activity",
  name: `Activity ${id}`,
  activity_name: `Activity ${id}`,
  latitude: 40.751,
  longitude: -73.979,
  borough: "Manhattan",
  city: "New York",
  state: "NY",
  ...extra,
});

function payload(overrides: Record<string, any> = {}) {
  return {
    requestId: "req-1",
    success: true,
    status: "success",
    restaurants: [],
    activities: [],
    pairs: [],
    cards: [],
    counts: {},
    card_counts: {},
    cardCounts: {},
    debug: {
      rawQuery: "Dinner and activity in Manhattan",
      wantsPairing: true,
      normalizedIntent: {
        geo: {
          borough: "Manhattan",
          city: "New York",
          state: "NY",
          explicitMarketRequested: true,
        },
      },
    },
    ...overrides,
  } as any;
}

describe("finalizePublicSearchPayload", () => {
  it("preserves restaurant and activity sections when pairs exist", () => {
    const result = finalizePublicSearchPayload(
      payload({
        restaurants: [restaurant("r1")],
        activities: [activity("a1")],
        pairs: [],
        restaurantCount: 99,
        activityCount: 99,
        cardCount: 99,
        result_count: 99,
        counts: { restaurants: 99, activities: 99, pairs: 99, cards: 99 },
        card_counts: { restaurants: 99, activities: 99, pairs: 99 },
        no_pairs_reason: "stale_reason",
      }),
    );

    expect(result.pairs).toHaveLength(1);
    expect(result.restaurants).toHaveLength(1);
    expect(result.activities).toHaveLength(1);
    expect(result.cards).toHaveLength(3);
    expect(result.cards[0]).toBe(result.pairs[0]);
    expect(result.restaurantCount).toBe(1);
    expect(result.activityCount).toBe(1);
    expect(result.cardCount).toBe(3);
    expect(result.result_count).toBe(3);
    expect(result.render_mode).toBe("mixed_results");
    expect(result.matched_locations).toHaveLength(2);
    expect(result.counts.displayedPairs).toBe(1);
    expect(result.counts.displayedRestaurantCards).toBe(1);
    expect(result.counts.displayedActivityCards).toBe(1);
    expect(result.counts.candidateRestaurants).toBe(1);
    expect(result.counts.candidateActivities).toBe(1);
    expect(result.card_counts.pairs).toBe(1);
    expect(result.no_pairs_reason).toBeNull();
  });

  it("keeps the exact live-jazz mixed response visible across all sections", () => {
    const restaurants = Array.from({ length: 12 }, (_, index) =>
      restaurant(`r${index + 1}`),
    );
    const activities = Array.from({ length: 4 }, (_, index) =>
      activity(`a${index + 1}`),
    );
    const pairs = [
      { restaurant: restaurants[0], activity: activities[0] },
      { restaurant: restaurants[1], activity: activities[1] },
      { restaurant: restaurants[2], activity: activities[2] },
    ];

    const result = finalizePublicSearchPayload(
      payload({
        restaurants,
        activities,
        pairs,
        debug: {
          rawQuery: "Romantic Italian dinner with live jazz in Manhattan tonight",
          wantsPairing: true,
          normalizedIntent: {
            geo: {
              borough: "Manhattan",
              city: "New York",
              state: "NY",
              explicitMarketRequested: true,
            },
          },
        },
      }),
    );

    expect(result.pairs).toHaveLength(3);
    expect(result.restaurants).toHaveLength(12);
    expect(result.activities).toHaveLength(4);
    expect(result.cards).toHaveLength(19);
    expect(result.render_mode).toBe("mixed_results");
    expect(result.debugParity.resultCounts).toEqual({
      restaurants: 12,
      activities: 4,
      pairs: 3,
      cards: 19,
    });
  });

  it("requires rooftop evidence on the activity side of fallback pairs", () => {
    const rooftop = activity("roof", {
      search_keywords: ["rooftop bar", "skyline views"],
    });
    const genericLounge = activity("lounge", {
      search_keywords: ["lounge", "cocktails", "nightlife"],
    });
    const r1 = restaurant("r1");

    const result = finalizePublicSearchPayload(
      payload({
        restaurants: [r1],
        activities: [genericLounge, rooftop],
        pairs: [
          { restaurant: r1, activity: genericLounge },
          { restaurant: r1, activity: rooftop },
        ],
        fallbackMode: "nearby_pair_after_strict_same_venue_rooftop_miss",
        debug: {
          rawQuery: "Steak dinner and rooftop drinks in Manhattan",
          sameVenueFallbackToNearbyPairAttempted: true,
          normalizedIntent: {
            geo: {
              borough: "Manhattan",
              city: "New York",
              state: "NY",
              explicitMarketRequested: true,
            },
          },
        },
      }),
    );

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].activity.id).toBe("roof");
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].id).toBe("roof");
    expect(result.debug.finalPublicRooftopActivityEvidenceRequired).toBe(true);
  });

  it("preserves explicit Manhattan geography during rooftop fallback", () => {
    const manhattanRestaurant = restaurant("m-r");
    const manhattanRooftop = activity("m-a", {
      search_keywords: ["rooftop", "terrace bar"],
    });
    const queensRooftop = activity("q-a", {
      borough: "Queens",
      city: "Ridgewood",
      latitude: 40.7,
      longitude: -73.91,
      search_keywords: ["rooftop bar"],
    });

    const result = finalizePublicSearchPayload(
      payload({
        restaurants: [manhattanRestaurant],
        activities: [queensRooftop, manhattanRooftop],
        fallbackMode: "nearby_pair_after_strict_same_venue_rooftop_miss",
        debug: {
          rawQuery: "Steak dinner and rooftop drinks in Manhattan",
          sameVenueFallbackToNearbyPairAttempted: true,
          normalizedIntent: {
            geo: {
              borough: "Manhattan",
              city: "New York",
              state: "NY",
              explicitMarketRequested: true,
            },
          },
        },
      }),
    );

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].activity.id).toBe("m-a");
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].id).toBe("m-a");
    expect(result.debug.finalPublicRequestedGeoPreserved).toBe(true);
  });

  it("tries all restaurant and activity centers instead of only the first", () => {
    const farRestaurant = restaurant("far-r", {
      latitude: 40.9,
      longitude: -73.7,
    });
    const nearRestaurant = restaurant("near-r", {
      latitude: 40.75,
      longitude: -73.98,
    });
    const farActivity = activity("far-a", {
      latitude: 40.6,
      longitude: -74.2,
    });
    const nearActivity = activity("near-a", {
      latitude: 40.751,
      longitude: -73.979,
    });

    const result = finalizePublicSearchPayload(
      payload({
        restaurants: [farRestaurant, nearRestaurant],
        activities: [farActivity, nearActivity],
      }),
    );

    expect(result.pairs.length).toBeGreaterThan(0);
    expect(
      result.pairs.some(
        (pair: any) =>
          pair.restaurant.id === "near-r" && pair.activity.id === "near-a",
      ),
    ).toBe(true);
    expect(result.restaurants).toHaveLength(2);
    expect(result.activities).toHaveLength(2);
    expect(result.debug.finalPublicRegeneratedPairCount).toBeGreaterThan(0);
  });
});
