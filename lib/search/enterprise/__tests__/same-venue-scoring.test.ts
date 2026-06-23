import { describe, expect, it } from "vitest";

import {
  scoreSameVenueAttributeMatch,
  sameVenueSearchTerms,
  isStrongSameVenueMatch,
} from "../ranking";
import type { EnterpriseLocation, SearchIntent } from "../types";

function intent(rawQuery: string): SearchIntent {
  const q = rawQuery.toLowerCase();
  return {
    rawQuery,
    searchType: "restaurant",
    primaryDomain: "restaurant",
    needsRestaurant: true,
    needsActivity: false,
    wantsPairing: false,
    restaurantIntent: {
      mealTerms: q.includes("brunch") ? ["brunch"] : q.includes("coffee") ? [] : ["dinner"],
      foodTerms: [
        ...(q.includes("caribbean") ? ["caribbean"] : []),
        ...(q.includes("italian") ? ["italian"] : []),
        ...(q.includes("coffee") ? ["coffee", "cafe"] : []),
      ],
      cuisineTerms: [
        ...(q.includes("caribbean") ? ["caribbean"] : []),
        ...(q.includes("italian") ? ["italian"] : []),
      ],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
    },
    activityIntent: {
      activityTerms: [],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
    },
    geo: { aliases: [], geoStrictness: "none" },
    vibe: [],
    strictness: "high",
    sameVenuePreferred: true,
  } as SearchIntent;
}

function record(name: string, searchDocument: string): EnterpriseLocation {
  return {
    id: name,
    name,
    restaurant_name: name,
    location_type: "restaurant",
    primary_category: "restaurant",
    search_document: searchDocument,
    semantic_search_text: searchDocument,
    tags: searchDocument.split(/\s+/),
    image_url: "https://example.test/photo.jpg",
    has_photos: true,
  };
}

describe("same-venue explicit secondary scoring", () => {
  it("ranks hookah/shisha above generic lounge for Caribbean food with hookah", () => {
    const searchIntent = intent("Caribbean food with hookah");
    const lounge = record(
      "Dunns River Lounge",
      "caribbean lounge food restaurant",
    );
    const hookah = record(
      "Caribbean Hookah Kitchen",
      "caribbean food hookah shisha hookah lounge",
    );

    const loungeScore = scoreSameVenueAttributeMatch(lounge, searchIntent);
    const hookahScore = scoreSameVenueAttributeMatch(hookah, searchIntent);

    expect(hookahScore.score).toBeGreaterThan(loungeScore.score);
    expect(hookahScore.secondaryMatchStrength).toMatch(/explicit|strong_synonym/);
    expect(loungeScore.secondaryMatchStrength).toBe("supporting");
    expect(isStrongSameVenueMatch(hookah, searchIntent)).toBe(true);
    expect(isStrongSameVenueMatch(lounge, searchIntent)).toBe(false);
  });

  it("does not treat food plus lounge as a strong hookah match", () => {
    const searchIntent = intent("Caribbean food with hookah");
    const generic = record(
      "Generic Caribbean Lounge",
      "caribbean food lounge restaurant",
    );
    const match = scoreSameVenueAttributeMatch(generic, searchIntent);

    expect(match.secondaryStrongMatched).toBe(false);
    expect((generic as any).sameVenueSecondaryStrongMatched).toBe(false);
    expect((generic as any).sameVenueRankingReason).not.toBe(
      "strong_matched_primary_and_explicit_secondary_same_venue_terms",
    );
    expect(match.score).toBeLessThan(180);
  });

  it("prefers live music/jazz over nightlife lounge for Italian dinner", () => {
    const searchIntent = intent("Italian dinner with live music");
    const lounge = record("Italian Lounge", "italian dinner lounge nightlife");
    const jazz = record(
      "Italian Jazz Supper Club",
      "italian dinner live music jazz band",
    );

    expect(scoreSameVenueAttributeMatch(jazz, searchIntent).score).toBeGreaterThan(
      scoreSameVenueAttributeMatch(lounge, searchIntent).score,
    );
  });

  it("prefers patio/terrace over generic seating for outdoor seating", () => {
    const searchIntent = intent("coffee shop with outdoor seating");
    const seating = record("Coffee Shop", "coffee seating cafe");
    const patio = record(
      "Garden Coffee",
      "coffee outdoor seating patio garden terrace",
    );

    expect(scoreSameVenueAttributeMatch(patio, searchIntent).score).toBeGreaterThan(
      scoreSameVenueAttributeMatch(seating, searchIntent).score,
    );
  });

  it("exposes explicit/strong/supporting/generic secondary term buckets", () => {
    const terms = sameVenueSearchTerms(intent("Caribbean food with hookah"));
    expect(terms.explicitSecondaryTerms).toContain("hookah");
    expect(terms.strongSecondarySynonyms).toContain("shisha");
    expect(terms.supportingSecondaryTerms).toContain("lounge");
    expect(terms.genericSecondaryTerms).toContain("food");
  });
});
