import { describe, expect, it } from "vitest";
import { filterResultsBySearchDomain } from "../../domainFilters";
import { shapePublicSearchCard } from "../../resultCards";
import { scoreActivityQuality } from "../ranking";
import type { EnterpriseLocation, SearchIntent } from "../types";

const baseIntent: SearchIntent = {
  rawQuery: "brunch and activity nearby",
  searchType: "mixed_outing",
  primaryDomain: "mixed",
  needsRestaurant: true,
  needsActivity: true,
  wantsPairing: true,
  pairingIntent: "nearby_pair",
  pairingPreference: { requiresPairing: true, distanceMode: "nearby", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false },
  restaurantIntent: { mealTerms: ["brunch"], foodTerms: [], cuisineTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
  activityIntent: { activityTerms: ["activity"], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
  geo: { aliases: [], geoStrictness: "default_market" },
  vibe: [],
  strictness: "medium",
};

describe("Phase 5 repair helpers", () => {
  it("keeps activity records out of final restaurant-domain results", () => {
    const restaurant = { id: "r1", name: "Chicken Lunch", location_type: "restaurant", cuisine: "chicken" } as EnterpriseLocation;
    const nightlife = { id: "a1", name: "Night Lounge", location_type: "activity", activity_type: "nightlife", google_types: ["restaurant"] } as any;
    const filtered = filterResultsBySearchDomain({ restaurants: [restaurant, nightlife], activities: [], intent: { ...baseIntent, searchType: "restaurant", primaryDomain: "restaurant", needsActivity: false, wantsPairing: false } });
    expect(filtered.restaurants).toEqual([restaurant]);
  });

  it("rejects invalid pair sides and same-record pairs", () => {
    const restaurant = { id: "r1", name: "Taco Spot", location_type: "restaurant", cuisine: "mexican" } as EnterpriseLocation;
    const activity = { id: "a1", name: "Bowling", location_type: "activity", activity_type: "bowling" } as EnterpriseLocation;
    const bad = { id: "a2", name: "Club", location_type: "activity", activity_type: "nightlife" } as EnterpriseLocation;
    const filtered = filterResultsBySearchDomain({ restaurants: [], activities: [], pairs: [{ restaurant, activity, score: 1 } as any, { restaurant: bad, activity, score: 1 } as any, { restaurant, activity: restaurant, score: 1 } as any], intent: baseIntent });
    expect(filtered.pairs).toHaveLength(1);
  });

  it("does not add sports-watch reasons or penalties to a non-sports mixed outing", () => {
    const activity = {
      id: "a1",
      name: "Sports-ish Bowling",
      location_type: "activity",
      activity_type: "bowling",
      primary_category: "sports bar",
      description: "TVs and screens",
      rating: 4.7,
      review_count: 500,
      images: ["https://cdn.example.com/bowling.jpg"],
    } as EnterpriseLocation;
    const scored = scoreActivityQuality(activity, { ...baseIntent, rawQuery: "brunch and activity nearby" });
    const reasonsAndPenalties = [...scored.reasons, ...scored.penalties];
    expect(reasonsAndPenalties.some((reason) => reason.includes("sports/game-watch fit"))).toBe(false);
    expect(reasonsAndPenalties.some((reason) => reason.includes("bar/pub fit for sports-watch query"))).toBe(false);
    expect(reasonsAndPenalties.some((reason) => reason.includes("missing sports bar/TV/game-watch signal"))).toBe(false);
  });

  it("does not add sports-watch reasons or penalties to a bar-focused non-sports query", () => {
    const activity = {
      id: "a1",
      name: "Neighborhood Bar",
      location_type: "activity",
      activity_type: "bar",
      primary_category: "bar",
      description: "Wings, beer, and a casual pub menu",
      rating: 4.5,
      review_count: 250,
      images: ["https://cdn.example.com/bar.jpg"],
    } as EnterpriseLocation;
    const scored = scoreActivityQuality(activity, {
      ...baseIntent,
      rawQuery: "bar with wings nyc",
      searchType: "activity",
      primaryDomain: "activity",
      needsRestaurant: false,
      wantsPairing: false,
    });
    const reasonsAndPenalties = [...scored.reasons, ...scored.penalties];
    expect(reasonsAndPenalties.some((reason) => reason.includes("sports/game-watch fit"))).toBe(false);
    expect(reasonsAndPenalties.some((reason) => reason.includes("bar/pub fit for sports-watch query"))).toBe(false);
    expect(reasonsAndPenalties.some((reason) => reason.includes("missing sports bar/TV/game-watch signal"))).toBe(false);
  });

  it("keeps sports-watch fit reasons available for an explicit game-watch query", () => {
    const activity = {
      id: "a1",
      name: "Harlem Sports Bar",
      location_type: "activity",
      activity_type: "bar",
      primary_category: "sports bar",
      description: "TVs, big screens, wings, and Knicks game watch parties",
      rating: 4.6,
      review_count: 500,
      images: ["https://cdn.example.com/sports-bar.jpg"],
    } as EnterpriseLocation;
    const scored = scoreActivityQuality(activity, {
      ...baseIntent,
      rawQuery: "best bar to watch the Knicks game in Harlem",
      searchType: "activity",
      primaryDomain: "activity",
      needsRestaurant: false,
      wantsPairing: false,
    });
    expect(scored.reasons.some((reason) => reason.includes("sports/game-watch fit") || reason.includes("bar/pub fit for sports-watch query"))).toBe(true);
  });

  it("dedupes public card images and excludes main from gallery", () => {
    const one = shapePublicSearchCard({ id: "1", name: "One", image_url: "https://cdn.example.com/one.jpg", main_image: "https://cdn.example.com/one.jpg", images: ["https://cdn.example.com/one.jpg"], gallery_images: ["https://cdn.example.com/one.jpg"] });
    expect(one.image_url).toBe("https://cdn.example.com/one.jpg");
    expect(one.main_image).toBe("https://cdn.example.com/one.jpg");
    expect(one.images).toEqual(["https://cdn.example.com/one.jpg"]);
    expect(one.gallery_images).toEqual([]);

    const multi = shapePublicSearchCard({ id: "2", name: "Two", main_image: "https://cdn.example.com/main.jpg", images: ["https://cdn.example.com/main.jpg", "https://cdn.example.com/side.jpg", "https://cdn.example.com/side.jpg"], gallery_images: ["https://cdn.example.com/main.jpg", "https://cdn.example.com/third.jpg"] });
    expect(multi.images).toEqual(["https://cdn.example.com/main.jpg", "https://cdn.example.com/side.jpg", "https://cdn.example.com/third.jpg"]);
    expect(multi.gallery_images).toEqual(["https://cdn.example.com/side.jpg", "https://cdn.example.com/third.jpg"]);
  });
});
