import { describe, expect, it } from "vitest";
import { rankActivityResults, rankRestaurantResults, scoreActivityQuality, scoreRestaurantQuality } from "../ranking";
import { activities, makeIntent, names, restaurants } from "./fixtures";

describe("enterprise search quality ranking", () => {
  it("ranks date/full-service restaurants above weak casual options for generic outing", () => {
    const intent = makeIntent("restaurant and rooftop drinks after walking distance");
    const candidates = restaurants.filter((r) => ["MOE EATS NYC", "Dave's Hot Chicken", "La Grande Boucherie", "Parker & Quinn", "OLIO E PIÙ Bryant Park"].includes(r.name!));
    const ranked = names(rankRestaurantResults(candidates.map((r) => ({ ...r })), intent));
    for (const strong of ["La Grande Boucherie", "Parker & Quinn", "OLIO E PIÙ Bryant Park"]) {
      expect(ranked.indexOf(strong)).toBeLessThan(ranked.indexOf("MOE EATS NYC"));
      expect(ranked.indexOf(strong)).toBeLessThan(ranked.indexOf("Dave's Hot Chicken"));
    }
  });

  it("reduces chicken/casual penalties when requested", () => {
    const generic = makeIntent("restaurant and rooftop drinks walking distance");
    const casual = makeIntent("casual chicken dinner and rooftop drinks walking distance");
    const daves = restaurants.find((r) => r.name === "Dave's Hot Chicken")!;
    expect(scoreRestaurantQuality({ ...daves }, casual).score).toBeGreaterThan(scoreRestaurantQuality({ ...daves }, generic).score);
  });

  it("ranks real rooftop venues above aggregators and suppresses theater unless requested", () => {
    const intent = makeIntent("restaurant and rooftop drinks after");
    const ranked = names(rankActivityResults(activities.filter((a) => ["Magic Hour Rooftop Bar & Lounge", "Dear Irving on Hudson Rooftop Bar", "Rooftop Bars NYC", "Winter Garden Theatre"].includes(a.name!)).map((a) => ({ ...a })), intent));
    expect(ranked.indexOf("Magic Hour Rooftop Bar & Lounge")).toBeLessThan(ranked.indexOf("Rooftop Bars NYC"));
    expect(ranked.indexOf("Dear Irving on Hudson Rooftop Bar")).toBeLessThan(ranked.indexOf("Rooftop Bars NYC"));
    expect(ranked).not.toContain("Winter Garden Theatre");
  });

  it("allows and boosts theaters when requested", () => {
    const intent = makeIntent("seafood dinner with theatre after");
    const winter = activities.find((a) => a.name === "Winter Garden Theatre")!;
    expect(scoreActivityQuality({ ...winter }, intent).score).toBeGreaterThan(0);
    expect(names(rankActivityResults([{ ...winter }], intent))).toContain("Winter Garden Theatre");
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
      aliases: ["Harlem", "harlem", "Manhattan", "New York", "New York County", "NY"],
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
          description: "sports bar with TVs, big screens, live NBA games, Knicks watch party",
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
    expect(((ranked[0] as any).activityQualityReasons ?? []).join(" ")).toMatch(/sports\/game-watch fit/i);
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

  it("keeps sports-watch scoring separate from rooftop-drinks searches", () => {
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

});
