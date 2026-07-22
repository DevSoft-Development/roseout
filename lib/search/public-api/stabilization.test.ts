import { describe, expect, it } from "vitest";
import { normalizeCreateSearchRequest } from "@/lib/search/normalizeCreateSearchRequest";
import {
  createPairingDebug,
  createSearchPairs,
} from "@/lib/search/enterprise/pairing";
import { deterministicIntentFromQuery } from "@/lib/search/enterprise/normalize-intent";
import type { EnterpriseLocation } from "@/lib/search/enterprise/types";

function loc(overrides: Partial<EnterpriseLocation>): EnterpriseLocation {
  return {
    id: "x",
    name: "Place",
    domain: "restaurant",
    location_type: "restaurant",
    primary_category: null,
    latitude: 40.758,
    longitude: -73.9855,
    match_score: 100,
    term_score: 50,
    geo_score: 0,
    city: "New York",
    state: "NY",
    neighborhood: "Midtown",
    borough: "Manhattan",
    search_document: "",
    semantic_search_text: "",
    tags: [],
    google_types: [],
    ...overrides,
  } as EnterpriseLocation;
}

describe("public search stabilization", () => {
  it.each([
    ["in queens", "Queens"],
    ["queens", "Queens"],
    ["queens ny", "Queens"],
    ["queens new york", "Queens"],
    ["in brooklyn", "Brooklyn"],
    ["in manhattan", "Manhattan"],
    ["in the bronx", "Bronx"],
    ["in staten island", "Staten Island"],
  ])("normalizes NYC borough phrase %s", (phrase, borough) => {
    const normalized = normalizeCreateSearchRequest({
      rawQuery: `steak dinner with hookah after ${phrase}`,
      source: "public_create",
    });
    expect(normalized.typedLocationIntent).toBe(true);
    expect(normalized.canonicalGeo).toMatchObject({
      city: "New York",
      state: "NY",
      borough,
      market: "NYC_CORE",
    });
    expect(normalized.searchBody).toMatchObject({
      city: "New York",
      state: "NY",
      borough,
      market: "NYC_CORE",
    });
  });

  it.each([
    "Astoria",
    "Flushing",
    "Jamaica",
    "Forest Hills",
    "Long Island City",
    "Bayside",
    "Elmhurst",
    "Fresh Meadows",
  ])(
    "preserves Queens neighborhood %s with borough geography",
    (neighborhood) => {
      const normalized = normalizeCreateSearchRequest({
        rawQuery: `hookah lounge in ${neighborhood} Queens`,
        source: "public_create",
      });
      expect(normalized.canonicalGeo).toMatchObject({
        city: "New York",
        state: "NY",
        borough: "Queens",
        neighborhood,
        market: "NYC_CORE",
      });
    },
  );

  it("keeps mixed outing metadata canonical for the production hookah query", () => {
    const normalized = normalizeCreateSearchRequest({
      rawQuery: "steak dinner with hookah after in queens",
      source: "public_create",
    });
    expect(normalized.debugParity).toMatchObject({
      searchType: "mixed_outing",
      wantsPairing: true,
      needsRestaurant: true,
      needsActivity: true,
    });
  });

  it("accepts a 0.48-mile pair and rejects a 7.66-mile default pair", () => {
    const intent = deterministicIntentFromQuery(
      "steak dinner and hookah in Queens",
    );
    const restaurant = loc({
      id: "r",
      latitude: 40.758,
      longitude: -73.9855,
      borough: "Queens",
    });
    const close = loc({
      id: "close",
      domain: "activity",
      location_type: "activity",
      latitude: 40.758,
      longitude: -73.9763,
      borough: "Queens",
    });
    const far = loc({
      id: "far",
      domain: "activity",
      location_type: "activity",
      latitude: 40.869,
      longitude: -73.9855,
      borough: "Queens",
    });
    const debug = createPairingDebug();
    const pairs = createSearchPairs([restaurant], [close, far], intent, debug);
    expect(pairs.some((pair) => pair.activity.id === "close")).toBe(true);
    expect(pairs.some((pair) => pair.activity.id === "far")).toBe(false);
    expect(debug.pairsRejectedForDistance).toBeGreaterThanOrEqual(1);
    expect(debug.validPairCountBeforeRender).toBe(1);
  });

  it("rejects missing-coordinate pairs without removing individual locations", () => {
    const intent = deterministicIntentFromQuery(
      "steak dinner and hookah in Queens",
    );
    const restaurant = loc({
      id: "r",
      latitude: null,
      longitude: null,
      borough: "Queens",
    });
    const activity = loc({
      id: "a",
      domain: "activity",
      location_type: "activity",
      borough: "Queens",
    });
    const debug = createPairingDebug();
    const pairs = createSearchPairs([restaurant], [activity], intent, debug);
    expect(pairs).toHaveLength(0);
    expect([restaurant.id, activity.id]).toEqual(["r", "a"]);
    expect(debug.pairsRejectedForMissingCoordinates).toBe(1);
  });
});
