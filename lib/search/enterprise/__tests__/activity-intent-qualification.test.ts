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
      id: "f6fbebc2-f3fc-469f-9c51-975a12c130e9",
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
});
