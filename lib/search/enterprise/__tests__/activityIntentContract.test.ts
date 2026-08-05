import { describe, expect, it } from "vitest";

import {
  detectCanonicalActivityEvidence,
  reconcileExplicitActivityIntent,
  registerCanonicalActivityVocabulary,
} from "../activityIntentContract";
import {
  ACTIVITY_SYNONYMS,
  GENERIC_ACTIVITY_SIGNAL_TERMS,
  hasGenericActivitySignal,
} from "../taxonomy";
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
    ["live jazz", "live_music"],
    ["jazz music", "live_music"],
    ["jazz performance", "live_music"],
    ["jazz club", "live_music"],
    ["karaoke", "karaoke"],
    ["comedy show", "comedy"],
    ["bowling", "games"],
    ["axe throwing", "games"],
    ["escape room", "interactive"],
    ["paint and sip", "interactive"],
    ["virtual reality", "interactive"],
    ["museum", "culture"],
    ["Broadway musical", "culture"],
    ["hookah", "nightlife"],
    ["rooftop cocktails", "nightlife"],
    ["spa", "wellness"],
    ["boat ride", "outdoors"],
  ])("detects %s as %s activity evidence", (query, category) => {
    const evidence = detectCanonicalActivityEvidence(query);
    expect(evidence.matched).toBe(true);
    expect(evidence.categories).toContain(category);
    expect(evidence.terms.length).toBeGreaterThan(0);
  });

  it("registers one vocabulary for all shared parser paths", () => {
    registerCanonicalActivityVocabulary();
    registerCanonicalActivityVocabulary();

    expect(hasGenericActivitySignal("Italian dinner with live jazz")).toBe(true);
    expect(hasGenericActivitySignal("Dinner with axe throwing")).toBe(true);
    expect(GENERIC_ACTIVITY_SIGNAL_TERMS).toContain("live jazz");
    expect(GENERIC_ACTIVITY_SIGNAL_TERMS).toContain("escape room");
    expect(ACTIVITY_SYNONYMS["live music"]).toEqual(
      expect.arrayContaining([
        "live jazz",
        "jazz music",
        "jazz performance",
        "jazz club",
      ]),
    );
    expect(
      GENERIC_ACTIVITY_SIGNAL_TERMS.filter((term) => term === "live jazz"),
    ).toHaveLength(1);
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
