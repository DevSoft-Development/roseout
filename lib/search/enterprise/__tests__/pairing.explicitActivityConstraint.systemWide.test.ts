import { describe, expect, it } from "vitest";

import { canonicalTaxonomy } from "@/lib/search/v2/taxonomy";
import { createSearchPairs } from "../pairing";

const explicitActivityEntries = canonicalTaxonomy.filter(
  (entry) => entry.domain === "activity" || entry.domain === "nightlife",
);

function searchIntent(rawQuery: string) {
  return {
    rawQuery,
    searchType: "mixed_outing",
    primaryDomain: "mixed",
    needsRestaurant: true,
    needsActivity: true,
    wantsPairing: true,
    strictness: "high",
    restaurantIntent: {
      mealTerms: ["dinner"],
      foodTerms: ["restaurant"],
      cuisineTerms: [],
      categoryTerms: ["restaurant"],
      vibeTerms: [],
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
    geo: {
      aliases: [],
      geoStrictness: "medium",
      latitude: 40.72,
      longitude: -73.84,
      radiusMiles: 8,
      state: "NY",
      city: "New York",
    },
    vibe: [],
    pairingPreference: {
      requiresPairing: true,
      distanceMode: "nearby",
      maxPairDistanceMiles: 3,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    },
  } as any;
}

const restaurant = {
  id: "restaurant",
  name: "Test Restaurant",
  location_type: "restaurant",
  latitude: 40.72,
  longitude: -73.84,
  city: "New York",
  state: "NY",
};

describe("pairing explicit activity constraints system-wide", () => {
  it.each(
    explicitActivityEntries.map((entry) => [entry.id, entry.aliases[0]] as const),
  )("does not substitute another activity for %s", (activityId, alias) => {
    const correct = {
      id: `correct-${activityId}`,
      name: `Correct ${activityId}`,
      location_type: "activity",
      activity_type: activityId,
      primary_category: activityId,
      latitude: 40.721,
      longitude: -73.841,
      city: "New York",
      state: "NY",
      match_score: 20,
    };
    const wrongActivityId = activityId === "bowling" ? "karaoke" : "bowling";
    const wrong = {
      id: `wrong-${wrongActivityId}`,
      name: `Wrong ${wrongActivityId}`,
      location_type: "activity",
      activity_type: wrongActivityId,
      primary_category: wrongActivityId,
      semantic_tags: ["activity", "entertainment", "nightlife", "games"],
      latitude: 40.7205,
      longitude: -73.8405,
      city: "New York",
      state: "NY",
      match_score: 999,
    };

    const pairs = createSearchPairs(
      [restaurant as any],
      [wrong as any, correct as any],
      searchIntent(`restaurant and ${alias} in Forest Hills`),
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.activity.id).toBe(`correct-${activityId}`);
  });

  it("rejects the Forest Hills hookah-to-bowling regression even when bowling scores higher", () => {
    const pairs = createSearchPairs(
      [restaurant as any],
      [
        {
          id: "bowling",
          name: "Forest Hills Bowling Center",
          location_type: "activity",
          activity_type: "bowling",
          primary_category: "bowling alley",
          semantic_tags: ["nightlife", "entertainment", "games"],
          latitude: 40.7201,
          longitude: -73.8401,
          match_score: 1000,
        } as any,
        {
          id: "hookah",
          name: "Forest Hills Hookah Lounge",
          location_type: "activity",
          activity_type: "hookah",
          primary_category: "hookah lounge",
          latitude: 40.722,
          longitude: -73.842,
          match_score: 10,
        } as any,
      ],
      searchIntent("hookah and restaurant in Forest Hills"),
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.activity.id).toBe("hookah");
  });
});
