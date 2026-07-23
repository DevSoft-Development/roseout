import { describe, expect, it } from "vitest";
import { qualifyExplicitActivityIntent } from "../taxonomy";
import { rankActivityResults } from "../ranking";
import { createPairingDebug, createSearchPairs } from "../pairing";
import type { EnterpriseLocation, SearchIntent } from "../types";

const bowlingIntent: SearchIntent = {
  rawQuery: "brunch and bowling in manhattan",
  searchType: "mixed_outing",
  primaryDomain: "mixed",
  needsRestaurant: true,
  needsActivity: true,
  wantsPairing: true,
  pairingIntent: "nearby_pair",
  pairingPreference: { requiresPairing: true, distanceMode: "nearby", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false },
  restaurantIntent: { mealTerms: ["brunch"], foodTerms: [], cuisineTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
  activityIntent: { activityTerms: ["bowling"], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
  geo: { aliases: [], geoStrictness: "strict", borough: "Manhattan", resolvedMarket: "NYC_CORE" },
  vibe: [],
  strictness: "medium",
};

const restaurant = { id: "r1", name: "George's", location_type: "restaurant", cuisine: "brunch", latitude: 40.704, longitude: -74.013 } as EnterpriseLocation;

function activity(input: Partial<EnterpriseLocation>): EnterpriseLocation {
  return { id: input.name ?? "a", location_type: "activity", latitude: 40.705, longitude: -74.014, ...input } as EnterpriseLocation;
}

describe("explicit activity intent qualification", () => {
  it("rejects Bowling Green as a bowling result and pair candidate", () => {
    const bowlingGreen = activity({
      id: "park-record",
      name: "Bowling Green",
      categories: ["park", "public park"] as any,
      tags: ["outdoor", "historic"],
    });
    const qualification = qualifyExplicitActivityIntent(bowlingGreen, ["bowling"]);
    expect(qualification.matches).toBe(false);
    expect(qualification.reason).toBe("conflicting_authoritative_category");

    const ranked = rankActivityResults([bowlingGreen], bowlingIntent);
    expect(ranked).toHaveLength(0);
    const pairs = createSearchPairs([restaurant], ranked, bowlingIntent, createPairingDebug());
    expect(pairs).toHaveLength(0);
  });

  it("accepts valid bowling venues from structured taxonomy even without name text", () => {
    const venues = [
      activity({ name: "Lucky Strike Times Square", categories: ["bowling alley", "entertainment venue"] as any }),
      activity({ name: "The Gutter L.E.S.", categories: ["bowling", "bar"] as any }),
      activity({ name: "Frames", primary_category: "entertainment venue", activity_type: "bowling" }),
    ];
    for (const venue of venues) {
      expect(qualifyExplicitActivityIntent(venue, ["bowling"]).matches).toBe(true);
    }
  });

  it.each([
    ["Bowling Green", "bowling"],
    ["Golf Street", "golf"],
    ["Museum Mile", "museum"],
    ["Cinema Village", "cinema"],
    ["Park Avenue", "park"],
  ])("does not let name-only text qualify %s for %s", (name, requestedIntent) => {
    const candidate = activity({ name, primary_category: "landmark" });
    expect(qualifyExplicitActivityIntent(candidate, [requestedIntent]).matches).toBe(false);
  });

  it("allows legitimate venues when structured categories confirm the activity", () => {
    const comedyCellar = activity({ name: "Comedy Cellar", primary_category: "comedy club", activity_type: "comedy" });
    expect(qualifyExplicitActivityIntent(comedyCellar, ["comedy"]).matches).toBe(true);
  });
  it("rejects polluted weak bowling evidence on a generic games record", () => {
    const polluted = activity({
      name: "Bowling Green",
      website: "http://www.nycgovparks.org/parks/bowling-green/",
      activity_type: "games",
      primary_category: "games",
      tags: ["bowling"],
      search_keywords: ["activity", "specialty activity", "bowling", "games", "fun"],
    });
    const qualification = qualifyExplicitActivityIntent(polluted, ["bowling"]);
    expect(qualification.matches).toBe(false);
    expect(qualification.reason).toBe("missing_structured_activity_evidence");
    expect(qualification.weakEvidence?.length).toBeGreaterThan(0);
    expect(rankActivityResults([polluted], bowlingIntent)).toHaveLength(0);
    expect(createSearchPairs([restaurant], rankActivityResults([polluted], bowlingIntent), bowlingIntent, createPairingDebug())).toHaveLength(0);
  });

  it("rejects generic games records with generated bowling tags", () => {
    const genericGames = activity({
      name: "Generic Games Lounge",
      activity_type: "games",
      primary_category: "games",
      tags: ["bowling"],
      search_keywords: ["bowling", "games"],
    });
    expect(qualifyExplicitActivityIntent(genericGames, ["bowling"])).toMatchObject({
      matches: false,
      reason: "missing_structured_activity_evidence",
    });
  });

  it("accepts provider-confirmed and multi-activity bowling venues", () => {
    const providerConfirmed = activity({
      name: "Bowlero With Food",
      google_types: ["bowling_alley", "bar", "restaurant"],
      primary_category: "entertainment",
      activity_type: "games",
    });
    const multiActivity = activity({
      name: "Arcade Bowl Complex",
      activity_type: "bowling",
      primary_category: "arcade",
      google_types: ["bar"],
      tags: ["arcade", "events"],
    });
    expect(qualifyExplicitActivityIntent(providerConfirmed, ["bowling"]).matches).toBe(true);
    expect(qualifyExplicitActivityIntent(multiActivity, ["bowling"]).matches).toBe(true);
  });

  it("keeps unrelated activities out of primary bowling results and pairs", () => {
    const unrelated = [
      activity({ name: "Pool Hall", activity_type: "billiards", primary_category: "billiards" }),
      activity({ name: "Golf Club", activity_type: "golf", primary_category: "golf" }),
      activity({ name: "Mini Golf", activity_type: "mini golf", primary_category: "mini golf" }),
      activity({ name: "Escape Room", activity_type: "escape room", primary_category: "escape room" }),
    ];
    const ranked = rankActivityResults(unrelated, bowlingIntent);
    expect(ranked).toEqual([]);
    expect(createSearchPairs([restaurant], ranked, bowlingIntent, createPairingDebug())).toEqual([]);
  });

  it("pairs steak restaurants only with qualified bowling activities", () => {
    const steakIntent = {
      ...bowlingIntent,
      rawQuery: "steak and bowling in manhattan",
      restaurantIntent: { ...bowlingIntent.restaurantIntent, mealTerms: [], foodTerms: ["steak"] },
    } satisfies SearchIntent;
    const steakhouse = { ...restaurant, id: "steak1", name: "Prime Steakhouse", cuisine: "steakhouse" } as EnterpriseLocation;
    const validBowling = activity({ id: "bowl1", name: "Lucky Strike Times Square", activity_type: "bowling", primary_category: "bowling" });
    const bowlingGreen = activity({ id: "park1", name: "Bowling Green", primary_category: "park", tags: ["bowling"] });
    const ranked = rankActivityResults([validBowling, bowlingGreen], steakIntent);
    const pairs = createSearchPairs([steakhouse], ranked, steakIntent, createPairingDebug());
    expect(ranked.map((item) => item.name)).toEqual(["Lucky Strike Times Square"]);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((pair) => pair.restaurant.name === "Prime Steakhouse")).toBe(true);
    expect(pairs.every((pair) => qualifyExplicitActivityIntent(pair.activity, ["bowling"]).matches)).toBe(true);
    expect(pairs.some((pair) => pair.activity.name === "Bowling Green")).toBe(false);
  });

});
