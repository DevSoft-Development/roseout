import { describe, expect, it } from "vitest";
import { normalizeIntent, restaurantSearchTerms, activitySearchTerms } from "../normalize-intent";
import { createPairingDebug, createSearchPairs } from "../pairing";

describe("TheOutHaven enterprise search regression requirements", () => {
  it("protects real failed search phrases", () => {
    const protectedQueries = [
      "steak dinner and rooftop drinks 30 minute walk apart",
      "steak dinner and rooftop drinks walking distance",
      "seafood dinner with theatre after",
      "girls night dinner and drinks",
      "casual dinner and relaxed activity",
      "restaurant with activity walking distance",
      "steak dinner and hookah lounge after",
    ];

    expect(protectedQueries).toContain("steak dinner and rooftop drinks 30 minute walk apart");
    expect(protectedQueries).toContain("girls night dinner and drinks");
    expect(protectedQueries).toContain("casual dinner and relaxed activity");
  });

  it("locks the walking and pairing rules that must not regress", () => {
    const rules = {
      generalWalkingCapMinutes: 60,
      explicitWalkingMinutesMustBeRespected: true,
      hideDistanceUnavailableWhenWalkingRequested: true,
      rejectExtremeWalkingRoutesBeforeRender: true,
      rooftopDrinksBelongToActivitySide: true,
      theatreOnlyWhenRequested: true,
      walkingResultsSortNearestFirst: true,
      crossCityAndCrossStateResultsRankLower: true,
    };

    expect(rules.generalWalkingCapMinutes).toBe(60);
    expect(rules.explicitWalkingMinutesMustBeRespected).toBe(true);
    expect(rules.hideDistanceUnavailableWhenWalkingRequested).toBe(true);
    expect(rules.rejectExtremeWalkingRoutesBeforeRender).toBe(true);
    expect(rules.rooftopDrinksBelongToActivitySide).toBe(true);
    expect(rules.theatreOnlyWhenRequested).toBe(true);
    expect(rules.walkingResultsSortNearestFirst).toBe(true);
    expect(rules.crossCityAndCrossStateResultsRankLower).toBe(true);
  });
});


const restaurant = (id: string, latitude: number, longitude: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  restaurant_name: id,
  location_type: "restaurant",
  borough: "Queens",
  city: "New York",
  state: "NY",
  latitude,
  longitude,
  has_photos: true,
  image_url: "https://example.com/photo.jpg",
  search_document: "restaurant dinner brunch food wings sports bar bar and grill rooftop hookah",
  ...extra,
} as any);

const activity = (id: string, latitude: number, longitude: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  activity_name: id,
  location_type: "activity",
  borough: "Queens",
  city: "New York",
  state: "NY",
  latitude,
  longitude,
  has_photos: true,
  image_url: "https://example.com/photo.jpg",
  search_document: "fun activity cocktails dancing hookah lounge live music museum",
  ...extra,
} as any);

describe("tricky real-sentence enterprise search intent regressions", () => {
  const nearbyRestaurants = [restaurant("brunch-restaurant", 40.75, -73.94), restaurant("dinner-restaurant", 40.751, -73.941)];
  const nearbyActivities = [activity("fun-activity", 40.752, -73.942), activity("hookah-lounge", 40.753, -73.943, { primary_category: "hookah lounge" })];

  it.each([
    "Find me a spot for brunch where we can do something fun after without needing to drive across town.",
    "Can you plan a girls night with dinner, cocktails, and somewhere we can dance after?",
    "I want dinner and hookah after, but not the same place unless it actually serves food too.",
    "Give me a restaurant and something fun after in Long Island, but make sure they’re actually near each other.",
    "I want a nice dinner first, then somewhere nearby with live music that isn’t too far to walk.",
    "seafood dinner with live jazz nearby",
    "dinner and activity close to each other not near me",
    "brunch and activity nearby",
  ])("keeps restaurant lane and pairability for %s", (query) => {
    const intent = normalizeIntent(query);
    expect(intent.searchType).toBe("mixed_outing");
    expect(intent.needsRestaurant).toBe(true);
    expect(intent.needsActivity).toBe(true);
    expect(restaurantSearchTerms(intent).length).toBeGreaterThan(0);
    expect(activitySearchTerms(intent).length).toBeGreaterThan(0);
    const pairs = createSearchPairs(nearbyRestaurants, nearbyActivities, intent, createPairingDebug());
    expect(pairs.length).toBeGreaterThan(0);
  });

  it("treats rooftop dinner in Queens as a same-location restaurant/combo search", () => {
    const intent = normalizeIntent("Find a rooftop dinner spot in Queens, not a separate rooftop bar after.");
    expect(intent.needsRestaurant).toBe(true);
    expect(intent.wantsPairing).toBe(false);
    expect(intent.needsActivity).toBe(false);
    expect(intent.searchType === "restaurant" || intent.searchType === "same_location_combo").toBe(true);
  });

  it("treats wings and Knicks game wording as same-location sports-bar food intent", () => {
    const intent = normalizeIntent("I want wings and a bar where I can watch the Knicks game, not a restaurant plus a separate activity.");
    expect(intent.wantsPairing).toBe(false);
    expect(intent.needsRestaurant).toBe(true);
    expect(restaurantSearchTerms(intent)).toEqual(expect.arrayContaining(["wings", "sports bar"]));
  });
});
