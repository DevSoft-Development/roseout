import { describe, expect, it, vi } from "vitest";

import {
  candidateSearchDomains,
  createCandidateSearchRequest,
  toEnterpriseSearchIntent,
} from "@/lib/search/contracts/candidateSearch";
import { retrieveSearchCandidates } from "../candidateRetrieval";
import { createPairingDebug, createSearchPairs } from "../pairing";
import type { EnterpriseLocation, SearchIntent } from "../types";

const query = "Romantic Italian dinner with live jazz in Manhattan tonight";

function provisionalSameLocationIntent(): SearchIntent {
  return {
    rawQuery: query,
    searchType: "same_location_combo",
    normalizedIntent: "same_location_combo",
    primaryDomain: "restaurant",
    needsRestaurant: true,
    needsActivity: false,
    wantsPairing: false,
    pairRequested: false,
    pairingIntent: "same_location",
    sameVenuePreferred: true,
    sameLocationRequired: true,
    fallbackPairAllowed: false,
    restaurantIntent: {
      mealTerms: ["dinner"],
      foodTerms: ["italian", "pasta"],
      cuisineTerms: ["italian"],
      categoryTerms: [],
      vibeTerms: ["romantic"],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    activityIntent: {
      activityTerms: ["live jazz", "jazz club"],
      categoryTerms: ["live_music"],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    pairingPreference: {
      requiresPairing: false,
      distanceMode: "any",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    },
    geo: {
      raw: "Manhattan",
      city: "New York",
      borough: "Manhattan",
      state: "NY",
      latitude: 40.75,
      longitude: -73.99,
      radiusMiles: 8,
      geoStrictness: "medium",
      requestedMarket: "NYC_CORE",
      resolvedMarket: "NYC_CORE",
    },
    occasion: "date night",
    partySize: null,
    timeContext: "dinner",
    budget: null,
    vibe: ["romantic"],
    strictness: "high",
  } as SearchIntent;
}

const restaurant: EnterpriseLocation = {
  id: "restaurant-live-finalizer",
  name: "Italian Dinner Fixture",
  restaurant_name: "Italian Dinner Fixture",
  location_type: "restaurant",
  cuisine: "italian",
  city: "New York",
  borough: "Manhattan",
  state: "NY",
  latitude: 40.7501,
  longitude: -73.9901,
  image_url: "https://example.com/restaurant.jpg",
} as EnterpriseLocation;

const activity: EnterpriseLocation = {
  id: "activity-live-finalizer",
  name: "Live Jazz Fixture",
  activity_name: "Live Jazz Fixture",
  location_type: "activity",
  activity_type: "live music",
  primary_category: "jazz club",
  city: "New York",
  borough: "Manhattan",
  state: "NY",
  latitude: 40.751,
  longitude: -73.991,
  image_url: "https://example.com/activity.jpg",
} as EnterpriseLocation;

describe("live public candidate and pairing pipeline", () => {
  it("repairs same_location_combo before retrieval and evaluates a real pair", async () => {
    const liveIntent = provisionalSameLocationIntent();
    const request = createCandidateSearchRequest({
      requestId: "live-finalizer-e2e",
      query,
      intent: liveIntent,
      selectedMarketId: "NYC_CORE",
    });

    expect(liveIntent.searchType).toBe("mixed_outing");
    expect(liveIntent.normalizedIntent).toBe("paired_outing");
    expect(liveIntent.primaryDomain).toBe("mixed");
    expect(liveIntent.needsRestaurant).toBe(true);
    expect(liveIntent.needsActivity).toBe(true);
    expect(liveIntent.wantsPairing).toBe(true);
    expect(liveIntent.sameVenuePreferred).toBe(true);
    expect(liveIntent.sameLocationRequired).toBe(false);
    expect(liveIntent.fallbackPairAllowed).toBe(true);
    expect(candidateSearchDomains(request)).toEqual(["restaurant", "activity"]);

    const searchLane = vi.fn(async (_supabase, _intent, domain) =>
      domain === "restaurant" ? [restaurant] : [activity],
    );

    const response = await retrieveSearchCandidates(
      { supabase: {} as never, request },
      { searchLane, now: () => 1 },
    );

    expect(searchLane).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ needsActivity: true, wantsPairing: true }),
      "restaurant",
      expect.anything(),
    );
    expect(searchLane).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ needsActivity: true, wantsPairing: true }),
      "activity",
      expect.anything(),
    );
    expect(response.restaurants).toHaveLength(1);
    expect(response.activities).toHaveLength(1);

    const pairingDebug = createPairingDebug();
    const pairs = createSearchPairs(
      response.restaurants,
      response.activities,
      toEnterpriseSearchIntent(request),
      pairingDebug,
    );

    expect(pairingDebug.pairCandidatesEvaluated).toBeGreaterThan(0);
    expect(pairs.length).toBeGreaterThan(0);
  });
});
