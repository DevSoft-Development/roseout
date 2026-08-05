import { describe, expect, it } from "vitest";

import { finalizeSearchIntent } from "../finalizeSearchIntent";
import type { SearchIntent } from "../types";

const baseIntent = {
  rawQuery: "Romantic Italian dinner with live jazz in Manhattan tonight",
  searchType: "restaurant",
  primaryDomain: "restaurant",
  needsRestaurant: true,
  needsActivity: false,
  wantsPairing: false,
  pairRequested: false,
  normalizedIntent: "restaurant_only",
  sameVenuePreferred: true,
  sameLocationRequired: true,
  fallbackPairAllowed: false,
  restaurantIntent: {
    mealTerms: ["dinner"],
    foodTerms: ["italian"],
    cuisineTerms: ["italian"],
    categoryTerms: [],
    vibeTerms: ["romantic"],
    featureTerms: [],
    negativeTerms: [],
    alternativeGroups: [],
  },
  activityIntent: {
    activityTerms: [],
    categoryTerms: [],
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
  geo: {},
  vibe: ["romantic"],
  strictness: "high",
} as SearchIntent;

describe("single canonical intent finalizer", () => {
  it("reconciles automatic intent once after any parser source", () => {
    const finalized = finalizeSearchIntent({
      query: baseIntent.rawQuery,
      intent: baseIntent,
      selectedLane: "auto",
    });

    expect(finalized.primaryDomain).toBe("mixed");
    expect(finalized.needsRestaurant).toBe(true);
    expect(finalized.needsActivity).toBe(true);
    expect(finalized.wantsPairing).toBe(true);
    expect(finalized.sameVenuePreferred).toBe(true);
    expect(finalized.sameLocationRequired).toBe(false);
    expect(finalized.fallbackPairAllowed).toBe(true);
  });

  it("respects an explicit restaurant-only lane without running mixed reconciliation", () => {
    const finalized = finalizeSearchIntent({
      query: baseIntent.rawQuery,
      intent: baseIntent,
      selectedLane: "restaurant",
    });

    expect(finalized.primaryDomain).toBe("restaurant");
    expect(finalized.needsActivity).toBe(false);
    expect(finalized.wantsPairing).toBe(false);
  });
});
