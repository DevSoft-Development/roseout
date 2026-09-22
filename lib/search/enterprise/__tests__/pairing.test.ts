import { describe, expect, it } from "vitest";
import { createPairingDebug, createSearchPairs } from "../pairing";
import { deterministicIntentFromQuery } from "../normalize-intent";
import type { EnterpriseLocation } from "../types";

function location(overrides: Partial<EnterpriseLocation>): EnterpriseLocation {
  return {
    id: "id",
    name: "Test",
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

describe("enterprise pairing regressions", () => {
  it("does not return pairs over explicit 30-minute walking request", () => {
    const intent = deterministicIntentFromQuery(
      "steak dinner and rooftop drinks 30 minute walk apart"
    );

    const restaurant = location({
      id: "r1",
      name: "Steak House",
      domain: "restaurant",
      location_type: "restaurant",
      latitude: 40.758,
      longitude: -73.9855,
    });

    const closeRooftop = location({
      id: "a1",
      name: "Close Rooftop Lounge",
      domain: "activity",
      location_type: "activity",
      activity_type: "rooftop lounge",
      latitude: 40.768,
      longitude: -73.9855,
    });

    const farRooftop = location({
      id: "a2",
      name: "Far Rooftop Lounge",
      domain: "activity",
      location_type: "activity",
      activity_type: "rooftop lounge",
      latitude: 40.82,
      longitude: -73.9855,
    });

    const debug = createPairingDebug();
    const pairs = createSearchPairs([restaurant], [closeRooftop, farRooftop], intent, debug);

    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((pair) => Number(pair.pairWalkingMinutes ?? 999) <= 30)).toBe(true);
    expect(pairs.some((pair) => pair.activity.id === "a2")).toBe(false);
  });

  it("keeps general walking-distance pairs at or under 60 minutes", () => {
    const intent = deterministicIntentFromQuery(
      "steak dinner and rooftop drinks walking distance"
    );

    const restaurant = location({
      id: "r1",
      name: "Steak House",
      domain: "restaurant",
      location_type: "restaurant",
      latitude: 40.758,
      longitude: -73.9855,
    });

    const validActivity = location({
      id: "a1",
      name: "Valid Rooftop",
      domain: "activity",
      location_type: "activity",
      activity_type: "rooftop lounge",
      latitude: 40.785,
      longitude: -73.9855,
    });

    const tooFarActivity = location({
      id: "a2",
      name: "Too Far Rooftop",
      domain: "activity",
      location_type: "activity",
      activity_type: "rooftop lounge",
      latitude: 40.86,
      longitude: -73.9855,
    });

    const pairs = createSearchPairs([restaurant], [validActivity, tooFarActivity], intent);

    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((pair) => Number(pair.pairWalkingMinutes ?? 999) <= 60)).toBe(true);
    expect(pairs.some((pair) => pair.activity.id === "a2")).toBe(false);
  });

  it("sorts walking-distance pairs nearest first", () => {
    const intent = deterministicIntentFromQuery(
      "restaurant with activity walking distance"
    );

    const restaurant = location({
      id: "r1",
      name: "Restaurant",
      latitude: 40.758,
      longitude: -73.9855,
    });

    const farther = location({
      id: "a1",
      name: "Farther Activity",
      domain: "activity",
      location_type: "activity",
      latitude: 40.785,
      longitude: -73.9855,
    });

    const closer = location({
      id: "a2",
      name: "Closer Activity",
      domain: "activity",
      location_type: "activity",
      latitude: 40.763,
      longitude: -73.9855,
    });

    const pairs = createSearchPairs([restaurant], [farther, closer], intent);

    expect(pairs.length).toBeGreaterThanOrEqual(2);
    expect(Number(pairs[0].pairWalkingMinutes)).toBeLessThanOrEqual(
      Number(pairs[1].pairWalkingMinutes)
    );
  });
  it("keeps requested-borough pairs when borough metadata is only present in searchable text", () => {
    const intent = deterministicIntentFromQuery(
      "Plan dinner and a comedy show in Queens."
    );

    const restaurant = location({
      id: "r1",
      name: "Queens Dinner",
      borough: null,
      neighborhood: "Astoria",
      address: "31-00 Broadway, Queens, NY",
      search_document: "sit-down restaurant Astoria Queens dinner",
      latitude: 40.764,
      longitude: -73.923,
    });

    const activity = location({
      id: "a1",
      name: "Queens Comedy",
      domain: "activity",
      location_type: "activity",
      activity_type: "comedy",
      borough: "Queens",
      neighborhood: "Long Island City",
      latitude: 40.745,
      longitude: -73.949,
    });

    const pairs = createSearchPairs([restaurant], [activity], intent);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].restaurant.id).toBe("r1");
    expect(pairs[0].activity.id).toBe("a1");
  });

  it("rejects a default pair outside the explicitly requested borough", () => {
    const intent = deterministicIntentFromQuery(
      "Plan dinner and a comedy show in Queens."
    );

    const restaurant = location({
      id: "r1",
      name: "Manhattan Dinner",
      borough: "Manhattan",
      neighborhood: "Midtown",
      latitude: 40.758,
      longitude: -73.9855,
    });

    const activity = location({
      id: "a1",
      name: "Queens Comedy",
      domain: "activity",
      location_type: "activity",
      activity_type: "comedy",
      borough: "Queens",
      neighborhood: "Long Island City",
      latitude: 40.745,
      longitude: -73.949,
    });

    const debug = createPairingDebug();
    const pairs = createSearchPairs([restaurant], [activity], intent, debug);

    expect(pairs).toHaveLength(0);
    expect(debug.rejectedPairs.some((row) => row.reason === "outside_requested_borough")).toBe(true);
  });

});
