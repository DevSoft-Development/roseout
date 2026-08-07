import { describe, expect, it } from "vitest";
import { applyFinalPublicActivityGuard } from "./finalActivityGuard";

const restaurant = (id: string, name: string, latitude: number, longitude: number) => ({
  id,
  name,
  restaurant_name: name,
  location_type: "restaurant",
  latitude,
  longitude,
});

const activity = (id: string, name: string, latitude: number, longitude: number) => ({
  id,
  name,
  activity_name: name,
  activity_type: "hookah",
  location_type: "activity",
  search_document: "hookah lounge shisha",
  latitude,
  longitude,
});

describe("final public pair uniqueness", () => {
  it("removes repeated restaurant and activity venues from an incoming pair list", () => {
    const favela = restaurant("favela", "Favela Grill Steakhouse", 40.76, -73.92);
    const vida = restaurant("vida", "VIDA SteakHouse NYC", 40.761, -73.921);
    const jasmin = activity("jasmin", "Jasmin Lounge", 40.762, -73.922);
    const aladdin = activity("aladdin", "ALADDIN HOOKAH LOUNGE", 40.763, -73.923);

    const result = applyFinalPublicActivityGuard(
      {
        restaurants: [favela, vida],
        activities: [jasmin, aladdin],
        pairs: [
          { restaurant: favela, activity: jasmin, pairScore: 100 },
          { restaurant: vida, activity: aladdin, pairScore: 99 },
          { restaurant: vida, activity: jasmin, pairScore: 98 },
        ],
        cards: [],
        normalizedIntent: {
          activityTerms: ["hookah"],
          wantsPairing: true,
        },
        debug: {
          wantsPairing: true,
          normalizedIntent: {
            activityTerms: ["hookah"],
            wantsPairing: true,
          },
        },
      },
      "steak dinner and hookah after in queens",
    );

    expect(result.pairs).toHaveLength(2);
    expect(result.pairs.map((pair: any) => pair.restaurant.id)).toEqual(["favela", "vida"]);
    expect(result.pairs.map((pair: any) => pair.activity.id)).toEqual(["jasmin", "aladdin"]);
    expect(new Set(result.pairs.map((pair: any) => pair.restaurant.id)).size).toBe(result.pairs.length);
    expect(new Set(result.pairs.map((pair: any) => pair.activity.id)).size).toBe(result.pairs.length);
    expect(result.debug.finalPublicActivityGuard.pairVenueUniquenessEnforced).toBe(true);
  });

  it("keeps scarce-activity recovery pairs unique on both sides", () => {
    const r1 = restaurant("r1", "Restaurant One", 40.750, -73.920);
    const r2 = restaurant("r2", "Restaurant Two", 40.752, -73.922);
    const a1 = activity("a1", "Hookah One", 40.751, -73.921);
    const a2 = activity("a2", "Hookah Two", 40.753, -73.923);

    const result = applyFinalPublicActivityGuard(
      {
        restaurants: [r1, r2],
        activities: [a1, a2],
        pairs: [],
        cards: [],
        normalizedIntent: {
          activityTerms: ["hookah"],
          wantsPairing: true,
        },
        debug: {
          wantsPairing: true,
          normalizedIntent: {
            activityTerms: ["hookah"],
            wantsPairing: true,
          },
        },
      },
      "steak dinner and hookah after in queens",
    );

    expect(result.pairs.length).toBeGreaterThan(0);
    expect(new Set(result.pairs.map((pair: any) => pair.restaurant.id)).size).toBe(result.pairs.length);
    expect(new Set(result.pairs.map((pair: any) => pair.activity.id)).size).toBe(result.pairs.length);
  });
});
