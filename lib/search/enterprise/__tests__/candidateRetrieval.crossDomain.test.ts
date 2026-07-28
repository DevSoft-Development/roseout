import { afterEach, describe, expect, it, vi } from "vitest";

import { createCandidateSearchRequest } from "@/lib/search/contracts/candidateSearch";
import { retrieveSearchCandidates } from "../candidateRetrieval";

function intent(rawQuery: string, overrides: Record<string, unknown> = {}) {
  return {
    rawQuery,
    searchType: "mixed_outing",
    primaryDomain: "mixed",
    needsRestaurant: true,
    needsActivity: true,
    wantsPairing: true,
    strictness: "high",
    restaurantIntent: {
      mealTerms: ["dinner"],
      foodTerms: ["restaurant"],
      cuisineTerms: [],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
    },
    activityIntent: {
      activityTerms: [],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
    },
    geo: {
      aliases: [],
      geoStrictness: "medium",
      latitude: 40.75,
      longitude: -73.9,
      radiusMiles: 8,
      state: "NY",
    },
    vibe: [],
    pairingPreference: {
      requiresPairing: true,
      distanceMode: "nearby",
      maxPairDistanceMiles: 3,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    },
    ...overrides,
  } as any;
}

function request(rawQuery: string, searchIntent = intent(rawQuery)) {
  return createCandidateSearchRequest({
    requestId: `test-${rawQuery}`,
    query: rawQuery,
    intent: searchIntent,
    restaurantLimit: 20,
    activityLimit: 20,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("candidate retrieval stabilization", () => {
  it("searches restaurant records and promotes a sports bar for activity-only intent", async () => {
    const rawQuery = "Best bar to watch the Knicks game in Harlem";
    const searchLane = vi.fn(async (_supabase, _intent, domain) =>
      domain === "restaurant"
        ? [{ id: "sports-1", location_type: "restaurant", search_document: "sports bar with live sports and big screens" }]
        : [],
    );

    const response = await retrieveSearchCandidates(
      { supabase: {} as any, request: request(rawQuery, intent(rawQuery, { needsRestaurant: false, primaryDomain: "activity", searchType: "activity", wantsPairing: false })) },
      { searchLane: searchLane as any },
    );

    expect(searchLane).toHaveBeenCalledWith(expect.anything(), expect.anything(), "restaurant", expect.anything());
    expect(response.restaurants).toEqual([]);
    expect(response.activities[0]).toMatchObject({ id: "sports-1", public_activity_role: "sports_watch", cross_domain_promoted: true });
  });

  it("removes seafood-only records from a sushi-primary search", async () => {
    const rawQuery = "Sushi in Flushing with karaoke after";
    const searchLane = vi.fn(async (_supabase, _intent, domain) =>
      domain === "restaurant"
        ? [
            { id: "seafood", location_type: "restaurant", search_document: "seafood lobster crab raw bar" },
            { id: "sushi", location_type: "restaurant", search_document: "sushi omakase nigiri restaurant" },
          ]
        : [],
    );

    const response = await retrieveSearchCandidates(
      { supabase: {} as any, request: request(rawQuery) },
      { searchLane: searchLane as any },
    );

    expect(response.restaurants.map((row) => row.id)).toEqual(["sushi"]);
  });

  it("runs Garden City restaurant recovery when activities exist but restaurants are empty", async () => {
    const rawQuery = "Family-friendly activity and restaurant in Garden City";
    const searchLane = vi.fn(async (_supabase, currentIntent, domain) => {
      if (domain === "activity") return [{ id: "park", location_type: "activity", latitude: 40.72, longitude: -73.63, search_document: "family friendly park" }];
      if (currentIntent.rawQuery === rawQuery) return [];
      return [{ id: "garden-restaurant", location_type: "restaurant", latitude: 40.73, longitude: -73.64, search_document: "family friendly restaurant dinner" }];
    });

    const response = await retrieveSearchCandidates(
      { supabase: {} as any, request: request(rawQuery, intent(rawQuery, { geo: { aliases: [], geoStrictness: "medium", city: "Garden City", state: "NY", latitude: 40.7268, longitude: -73.6343, radiusMiles: 5 } })) },
      { searchLane: searchLane as any },
    );

    expect(response.restaurants.map((row) => row.id)).toContain("garden-restaurant");
  });

  it("centers restaurant recovery on the recovered hookah location", async () => {
    const rawQuery = "Restaurant with hookah lounge after in Queens";
    const searchLane = vi.fn(async (_supabase, currentIntent, domain) => {
      if (domain === "activity") return [{ id: "hookah", location_type: "activity", latitude: 40.74, longitude: -73.82, search_document: "hookah lounge shisha bar" }];
      if (currentIntent.rawQuery === rawQuery) return [{ id: "far", location_type: "restaurant", latitude: 40.8, longitude: -73.95, search_document: "restaurant dinner" }];
      expect(currentIntent.geo.latitude).toBe(40.74);
      expect(currentIntent.geo.longitude).toBe(-73.82);
      return [{ id: "near", location_type: "restaurant", latitude: 40.741, longitude: -73.821, search_document: "restaurant dinner" }];
    });

    const response = await retrieveSearchCandidates(
      { supabase: {} as any, request: request(rawQuery) },
      { searchLane: searchLane as any },
    );

    expect(response.restaurants.map((row) => row.id)).toContain("near");
  });

  it("does not await candidate shadow telemetry", async () => {
    vi.stubEnv("SEARCH_EDGE_CANDIDATE_MODE", "shadow");
    const never = new Promise<Response>(() => {});
    const searchLane = vi.fn(async () => []);

    const response = await Promise.race([
      retrieveSearchCandidates(
        { supabase: {} as any, request: request("Fun activity", intent("Fun activity", { needsRestaurant: false, primaryDomain: "activity", searchType: "activity", wantsPairing: false })) },
        { searchLane: searchLane as any, fetchImpl: (() => never) as any },
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error("shadow blocked response")), 50)),
    ]);

    expect(response).toBeTruthy();
  });
});
