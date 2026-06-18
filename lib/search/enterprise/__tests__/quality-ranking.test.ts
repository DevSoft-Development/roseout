import { describe, expect, it } from "vitest";
import {
  rankActivityResults,
  rankRestaurantResults,
  scoreActivityQuality,
  scoreRestaurantQuality,
} from "../ranking";
import { normalizeIntent } from "../normalize-intent";
import { activities, makeIntent, names, restaurants } from "./fixtures";

describe("enterprise search quality ranking", () => {
  it("ranks date/full-service restaurants above weak casual options for generic outing", () => {
    const intent = makeIntent(
      "restaurant and rooftop drinks after walking distance",
    );
    const candidates = restaurants.filter((r) =>
      [
        "MOE EATS NYC",
        "Dave's Hot Chicken",
        "La Grande Boucherie",
        "Parker & Quinn",
        "OLIO E PIÙ Bryant Park",
      ].includes(r.name!),
    );
    const ranked = names(
      rankRestaurantResults(
        candidates.map((r) => ({ ...r })),
        intent,
      ),
    );
    for (const strong of [
      "La Grande Boucherie",
      "Parker & Quinn",
      "OLIO E PIÙ Bryant Park",
    ]) {
      expect(ranked.indexOf(strong)).toBeLessThan(
        ranked.indexOf("MOE EATS NYC"),
      );
      expect(ranked.indexOf(strong)).toBeLessThan(
        ranked.indexOf("Dave's Hot Chicken"),
      );
    }
  });

  it("reduces chicken/casual penalties when requested", () => {
    const generic = makeIntent(
      "restaurant and rooftop drinks walking distance",
    );
    const casual = makeIntent(
      "casual chicken dinner and rooftop drinks walking distance",
    );
    const daves = restaurants.find((r) => r.name === "Dave's Hot Chicken")!;
    expect(scoreRestaurantQuality({ ...daves }, casual).score).toBeGreaterThan(
      scoreRestaurantQuality({ ...daves }, generic).score,
    );
  });

  it("ranks real rooftop venues above aggregators and suppresses theater unless requested", () => {
    const intent = makeIntent("restaurant and rooftop drinks after");
    const ranked = names(
      rankActivityResults(
        activities
          .filter((a) =>
            [
              "Magic Hour Rooftop Bar & Lounge",
              "Dear Irving on Hudson Rooftop Bar",
              "Rooftop Bars NYC",
              "Winter Garden Theatre",
            ].includes(a.name!),
          )
          .map((a) => ({ ...a })),
        intent,
      ),
    );
    expect(ranked.indexOf("Magic Hour Rooftop Bar & Lounge")).toBeLessThan(
      ranked.indexOf("Rooftop Bars NYC"),
    );
    expect(ranked.indexOf("Dear Irving on Hudson Rooftop Bar")).toBeLessThan(
      ranked.indexOf("Rooftop Bars NYC"),
    );
    expect(ranked).not.toContain("Winter Garden Theatre");
  });

  it("allows and boosts theaters when requested", () => {
    const intent = makeIntent("seafood dinner with theatre after");
    const winter = activities.find((a) => a.name === "Winter Garden Theatre")!;
    expect(scoreActivityQuality({ ...winter }, intent).score).toBeGreaterThan(
      0,
    );
    expect(names(rankActivityResults([{ ...winter }], intent))).toContain(
      "Winter Garden Theatre",
    );
  });
});

it("prioritizes sports bars with TVs over rooftop lounges for game-watch searches", () => {
  const intent = makeIntent("Best bar to watch the Knicks game in Harlem");

  intent.searchType = "activity";
  intent.primaryDomain = "activity";
  intent.needsRestaurant = false;
  intent.needsActivity = true;
  intent.wantsPairing = false;
  intent.activityIntent = {
    activityTerms: ["bar", "watch knicks game", "sports bar"],
    categoryTerms: ["sports bar"],
    featureTerms: ["tv"],
    vibeTerms: [],
    negativeTerms: [],
    alternativeGroups: [],
  } as any;
  intent.restaurantIntent = {
    foodTerms: [],
    mealTerms: [],
    vibeTerms: [],
    cuisineTerms: [],
    featureTerms: [],
    categoryTerms: [],
    negativeTerms: [],
    alternativeGroups: [],
  } as any;
  intent.geo = {
    raw: "Harlem",
    city: "New York",
    state: "NY",
    borough: "Manhattan",
    county: "New York County",
    region: null,
    aliases: [
      "Harlem",
      "harlem",
      "Manhattan",
      "New York",
      "New York County",
      "NY",
    ],
    latitude: 40.888,
    longitude: -73.954,
    radiusMiles: 3,
    neighborhood: "Harlem",
    geoStrictness: "strict",
  } as any;

  const ranked = rankActivityResults(
    [
      {
        id: "rooftop",
        name: "Republica Restaurant Rooftop & Lounge",
        primary_category: "rooftop lounge",
        description: "rooftop cocktails skyline lounge nightlife",
        rating: 4.6,
        review_count: 600,
        image_url: "x.jpg",
        latitude: 40.87,
        longitude: -73.95,
      },
      {
        id: "sports",
        name: "Harlem Sports Bar & Grill",
        primary_category: "sports bar",
        description:
          "sports bar with TVs, big screens, live NBA games, Knicks watch party",
        rating: 4.2,
        review_count: 120,
        image_url: "x.jpg",
        latitude: 40.888,
        longitude: -73.954,
      },
    ] as any,
    intent,
  );

  expect(ranked[0].id).toBe("sports");
  expect(((ranked[0] as any).activityQualityReasons ?? []).join(" ")).toMatch(
    /sports\/game-watch fit/i,
  );
});

it("penalizes nightlife-only clubs for sports-watch searches", () => {
  const intent = makeIntent("bar to watch the Knicks game");
  intent.searchType = "activity";
  intent.primaryDomain = "activity";
  intent.needsRestaurant = false;
  intent.needsActivity = true;
  intent.wantsPairing = false;
  intent.activityIntent = {
    activityTerms: ["bar", "watch knicks game", "sports bar"],
    categoryTerms: ["sports bar"],
    featureTerms: ["tv"],
    vibeTerms: [],
    negativeTerms: [],
    alternativeGroups: [],
  } as any;
  const club = {
    id: "club",
    name: "DJ Night Club",
    primary_category: "dance club",
    description: "live dj dancing nightlife",
    rating: 4.8,
    review_count: 1000,
    image_url: "x.jpg",
    latitude: 40.888,
    longitude: -73.954,
  } as any;
  const scored = scoreActivityQuality(club, intent);
  expect(scored.penalties.join(" ")).toMatch(/nightlife\/rooftop-only result/i);
  expect(scored.score).toBeLessThan(30);
});

it("keeps rooftop boosts for rooftop-drinks searches", () => {
  const rooftopIntent = makeIntent("rooftop drinks in Harlem");
  const rooftop = {
    id: "rooftop",
    name: "Harlem Rooftop Lounge",
    primary_category: "rooftop lounge",
    description: "rooftop cocktails skyline lounge nightlife",
    rating: 4.6,
    review_count: 600,
    image_url: "x.jpg",
    latitude: 40.888,
    longitude: -73.954,
  } as any;
  const scored = scoreActivityQuality(rooftop, rooftopIntent);
  expect(scored.reasons.join(" ")).toMatch(/rooftop\/terrace\/skyline signal/i);
  expect(scored.penalties.join(" ")).not.toMatch(/sports bar\/TV\/game-watch/i);
});

it("counts Playoffs Sport Lounge as sports-watch fit", () => {
  const intent = normalizeIntent(
    "Best bar to watch the Knicks game in Harlem",
    {
      searchType: "activity",
      primaryDomain: "activity",
      needsRestaurant: false,
      needsActivity: true,
      wantsPairing: false,
      activityIntent: {
        activityTerms: ["sports bar", "sport lounge", "knicks game"],
        categoryTerms: ["sports bar"],
        featureTerms: ["tv"],
        vibeTerms: [],
        negativeTerms: [],
        alternativeGroups: [],
      },
    } as any,
  );

  const scored = scoreActivityQuality(
    {
      name: "Playoffs Sport Lounge",
      primary_category: "sport lounge",
      description: "bar showing games",
      image_url: "x.jpg",
      rating: 4.1,
      review_count: 80,
    } as any,
    intent as any,
  );

  expect(scored.reasons.join(" ")).toMatch(/sports\/game-watch fit/i);
  expect(scored.penalties.join(" ")).not.toMatch(
    /missing sports bar\/TV\/game-watch/i,
  );
  expect(scored.score).toBeGreaterThan(50);
});

it("ranks dual-match single-venue-with records first", () => {
  const intent = normalizeIntent("bar with wings nyc");
  const ranked = rankRestaurantResults(
    [
      {
        id: "a",
        name: "Ace Sports Bar",
        restaurant_name: "Ace Sports Bar",
        location_type: "restaurant",
        primary_category: "sports bar pub",
        cuisine: "American bar food",
        description: "Sports bar and pub serving chicken wings with TVs.",
        image_url: "x.jpg",
      },
      {
        id: "b",
        name: "Chicken Only",
        restaurant_name: "Chicken Only",
        location_type: "restaurant",
        primary_category: "chicken restaurant",
        cuisine: "Chicken wings",
        description: "Chicken wings and fried chicken counter service.",
        image_url: "x.jpg",
      },
      {
        id: "c",
        name: "Velvet Lounge",
        restaurant_name: "Velvet Lounge",
        location_type: "restaurant",
        primary_category: "lounge bar",
        cuisine: "American",
        description: "Cocktail lounge with nightlife but no wings.",
        image_url: "x.jpg",
      },
      {
        id: "d",
        name: "Night Activity",
        activity_name: "Night Activity",
        location_type: "activity",
        primary_category: "nightlife activity",
        activity_type: "nightlife",
        description: "Nightlife activity with music.",
        image_url: "x.jpg",
      },
    ] as any,
    intent,
  );

  expect(ranked[0].id).toBe("a");
  expect(
    (ranked.find((item) => item.id === "a") as any).singleVenueWithScore,
  ).toBeGreaterThan(
    (ranked.find((item) => item.id === "b") as any).singleVenueWithScore,
  );
  expect(ranked.map((item) => item.id)).not.toContain("d");
});

it("suppresses cafe/bakery/dessert-only records for date-night dinner intent", () => {
  const intent = makeIntent("date night near me");
  const ranked = rankRestaurantResults(
    [
      {
        id: "cafe",
        name: "CAFE BLESSING",
        restaurant_name: "CAFE BLESSING",
        primary_category: "cafe bakery coffee shop",
        cuisine: "Cafe",
        description: "Coffee, pastries, yogurt, quick bites, and dessert.",
        rating: 4.9,
        review_count: 2000,
        image_url: "x.jpg",
        location_type: "restaurant",
      },
      {
        id: "dinner",
        name: "Velvet Table",
        restaurant_name: "Velvet Table",
        primary_category: "full service new american restaurant",
        cuisine: "New American",
        tags: ["date night", "dinner", "reservations", "romantic"],
        description:
          "Full-service dinner restaurant with cocktails and romantic ambiance.",
        rating: 4.4,
        review_count: 250,
        image_url: "x.jpg",
        location_type: "restaurant",
      },
    ] as any,
    intent,
  );

  expect(ranked[0].id).toBe("dinner");
  expect(
    (
      (ranked.find((item) => item.id === "cafe") as any)
        .restaurantQualityPenalties ?? []
    ).join(" "),
  ).toMatch(
    /cafe\/bakery\/dessert-only suppressed for date-night dinner intent/i,
  );
});

it("allows explicit coffee, dessert, bakery, and brunch-cafe intents", () => {
  const cafe = {
    id: "cafe",
    name: "GREY Cafe",
    restaurant_name: "GREY Cafe",
    primary_category: "cafe coffee shop bakery dessert",
    cuisine: "Cafe",
    description: "Coffee, pastries, dessert, brunch cafe, and quick bites.",
    rating: 4.6,
    review_count: 800,
    image_url: "x.jpg",
    location_type: "restaurant",
  } as any;

  for (const query of [
    "coffee date near me",
    "dessert date near me",
    "bakery near me",
    "brunch cafe near me",
  ]) {
    const ranked = rankRestaurantResults([{ ...cafe }], makeIntent(query));
    expect(ranked).toHaveLength(1);
    expect(
      ((ranked[0] as any).restaurantQualityPenalties ?? []).join(" "),
    ).not.toMatch(/date-night dinner intent/i);
  }
});
