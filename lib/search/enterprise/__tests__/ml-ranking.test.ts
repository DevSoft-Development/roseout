import { describe, expect, it } from "vitest";
import { calculateMlBoost } from "@/lib/ml/locationRanking";
import { buildMlRankDelta } from "../index";
import { rankRestaurantResults } from "../ranking";
import { deterministicIntentFromQuery } from "../normalize-intent";
import type { EnterpriseLocation } from "../types";

function restaurant(
  overrides: Partial<EnterpriseLocation>,
): EnterpriseLocation {
  return {
    id: "id",
    name: "Test Restaurant",
    location_type: "restaurant",
    primary_category: "restaurant",
    city: "New York",
    state: "NY",
    borough: "Manhattan",
    latitude: 40.758,
    longitude: -73.9855,
    rating: 4.5,
    review_count: 100,
    tags: [],
    google_types: ["restaurant"],
    search_document: "restaurant dinner",
    semantic_search_text: "restaurant dinner",
    ...overrides,
  } as EnterpriseLocation;
}

describe("enterprise ML ranking boost", () => {
  it("adds a small capped boost for ml_score", () => {
    expect(calculateMlBoost(100)).toBe(15);
    expect(calculateMlBoost(1000)).toBe(20);
    expect(calculateMlBoost(null)).toBe(0);
  });

  it("lets ML score improve ordering only as a small additive signal", () => {
    const intent = deterministicIntentFromQuery(
      "restaurant dinner in Manhattan",
    );
    const lowMl = restaurant({ id: "low", name: "Dinner Low", ml_score: 0 });
    const highMl = restaurant({
      id: "high",
      name: "Dinner High",
      ml_score: 100,
    });
    const ranked = rankRestaurantResults([lowMl, highMl], intent);
    expect((ranked.find((item) => item.id === "high") as any).ml_boost).toBe(
      15,
    );
  });

  it("calculates admin ML rank deltas", () => {
    expect(buildMlRankDelta(7, 3)).toBe(4);
    expect(buildMlRankDelta(2, 5)).toBe(-3);
    expect(buildMlRankDelta(4, 4)).toBe(0);
  });

  it("does not allow bad domain/category candidates to beat valid restaurants only because of ML", () => {
    const intent = deterministicIntentFromQuery(
      "sushi restaurant in Manhattan",
    );
    const good = restaurant({
      id: "good",
      name: "Good Sushi",
      cuisine: "sushi",
      search_document: "sushi restaurant Manhattan",
      ml_score: 0,
    });
    const bad = restaurant({
      id: "bad",
      name: "Bad Arcade",
      location_type: "activity",
      primary_category: "arcade",
      search_document: "arcade games",
      google_types: ["amusement_center"],
      ml_score: 100,
    });
    const ranked = rankRestaurantResults([bad, good], intent);
    expect(ranked.map((item) => item.id)).toEqual(["good"]);
  });
});
