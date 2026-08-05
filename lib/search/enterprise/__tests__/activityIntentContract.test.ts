import { describe, expect, it } from "vitest";

import {
  detectCanonicalActivityEvidence,
  reconcileExplicitActivityIntent,
} from "../activityIntentContract";
import type { SearchIntent } from "../types";

function restaurantIntent(query: string): SearchIntent {
  return {
    rawQuery: query,
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
      foodTerms: ["italian", "pasta", "pizza"],
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
}

describe("canonical activity evidence", () => {
  it.each([
    "live jazz",
    "jazz music",
    "jazz performance",
    "jazz club",
    "karaoke",
    "bowling",
    "escape room",
    "paint and sip",
    "museum",
    "comedy show",
    "hookah",
    "axe throwing",
  ])("recognizes %s as activity evidence", (phrase) => {
    expect(detectCanonicalActivityEvidence(`Dinner with ${phrase}`).matched).toBe(true);
  });

  it("repairs the exact public live-jazz query into a mixed same-venue-first search", () => {
    const query = "Romantic Italian dinner with live jazz in Manhattan tonight";
    const repaired = reconcileExplicitActivityIntent(query, restaurantIntent(query));

    expect(repaired.needsRestaurant).toBe(true);
    expect(repaired.needsActivity).toBe(true);
    expect(repaired.wantsPairing).toBe(true);
    expect(repaired.primaryDomain).toBe("mixed");
    expect(repaired.sameVenuePreferred).toBe(true);
    expect(repaired.sameLocationRequired).toBe(false);
    expect(repaired.fallbackPairAllowed).toBe(true);
    expect(repaired.activityIntent.activityTerms).toEqual(
      expect.arrayContaining(["live jazz", "live music", "jazz club"]),
    );
  });

  it("preserves cuisine and restaurant requirements while adding activity intent", () => {
    const query = "Italian dinner with bowling in Manhattan";
    const repaired = reconcileExplicitActivityIntent(query, restaurantIntent(query));

    expect(repaired.restaurantIntent.cuisineTerms).toContain("italian");
    expect(repaired.needsRestaurant).toBe(true);
    expect(repaired.needsActivity).toBe(true);
    expect(repaired.activityIntent.activityTerms).toContain("bowling");
  });
});
