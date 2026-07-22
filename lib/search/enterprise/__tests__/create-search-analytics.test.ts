import { describe, expect, it } from "vitest";
import { getCreateSearchAnalyticsIntent } from "../createSearchAnalytics";

const counts = { restaurants: 0, activities: 0, pairs: 0 };

describe("create search analytics intent", () => {
  it("promotes restaurant-only borough canonical geography", () => {
    const intent = getCreateSearchAnalyticsIntent({
      result: { render_mode: "restaurants" },
      debug: {
        debugParity: {
          searchType: "restaurant",
          selectedSearchLane: "restaurant",
        },
      },
      counts,
      selectedSearchLane: "restaurant",
      canonicalGeo: {
        raw: "queens",
        city: "New York",
        state: "NY",
        borough: "Queens",
        latitude: 40.7282,
        longitude: -73.7949,
        market: "NYC_CORE",
        requestedMarket: "NYC_CORE",
        resolvedMarket: "NYC_CORE",
      },
    });

    expect(intent?.geo?.city).toBe("New York");
    expect(intent?.geo?.state).toBe("NY");
    expect(intent?.geo?.borough).toBe("Queens");
    expect(intent?.searchType).toBe("restaurant_only");
    expect(intent?.primaryDomain).toBe("restaurant");
    expect(intent?.needsRestaurant).toBe(true);
    expect(intent?.needsActivity).toBe(false);
    expect(intent?.wantsPairing).toBe(false);
  });

  it("promotes activity-only borough canonical geography", () => {
    const intent = getCreateSearchAnalyticsIntent({
      result: {},
      debug: {
        debugParity: { searchType: "activity", selectedSearchLane: "activity" },
      },
      counts,
      selectedSearchLane: "activity",
      canonicalGeo: {
        city: "New York",
        state: "NY",
        borough: "Brooklyn",
        resolvedMarket: "NYC_CORE",
      },
    });

    expect(intent?.searchType).toBe("activity_only");
    expect(intent?.primaryDomain).toBe("activity");
    expect(intent?.needsRestaurant).toBe(false);
    expect(intent?.needsActivity).toBe(true);
    expect(intent?.wantsPairing).toBe(false);
    expect(intent?.geo?.borough).toBe("Brooklyn");
  });

  it("promotes mixed intent without depending on returned result categories", () => {
    const intent = getCreateSearchAnalyticsIntent({
      result: { render_mode: "empty" },
      debug: {
        debugParity: {
          searchType: "mixed_outing",
          selectedSearchLane: "mixed",
        },
      },
      counts,
      selectedSearchLane: "mixed",
      canonicalGeo: {
        city: "New York",
        state: "NY",
        borough: "Queens",
        resolvedMarket: "NYC_CORE",
      },
    });

    expect(intent?.primaryDomain).toBe("mixed");
    expect(intent?.needsRestaurant).toBe(true);
    expect(intent?.needsActivity).toBe(true);
    expect(intent?.wantsPairing).toBe(true);
  });

  it("preserves typed canonical geo over browser-coordinate fallback", () => {
    const intent = getCreateSearchAnalyticsIntent({
      result: { geo: { latitude: 40.1, longitude: -74.1 } },
      debug: {
        debugParity: {
          searchType: "restaurant",
          selectedSearchLane: "restaurant",
        },
      },
      counts,
      selectedSearchLane: "restaurant",
      canonicalGeo: {
        city: "New York",
        state: "NY",
        borough: "Queens",
        latitude: 40.7282,
        longitude: -73.7949,
      },
    });

    expect(intent?.geo?.borough).toBe("Queens");
    expect(intent?.geo?.city).toBe("New York");
  });
});
