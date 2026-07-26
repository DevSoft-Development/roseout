import { describe, expect, it, vi } from "vitest";

import {
  createCandidateSearchRequest,
  validateCandidateSearchResponse,
  type CandidateSearchRequest,
} from "@/lib/search/contracts/candidateSearch";

import {
  SEARCH_CANDIDATE_CONTRACT_VERSION,
  SearchCandidateContractVersionError,
} from "@/lib/search/contracts/searchContractVersion";

import {
  applyCandidateRetrievalTelemetry,
  retrieveSearchCandidates,
} from "../candidateRetrieval";

import type {
  EnterpriseLocation,
  SearchIntent,
} from "../types";

const restaurantRows: EnterpriseLocation[] = [
  {
    id: "restaurant-1",
    name: "Restaurant One",
    restaurant_name: "Restaurant One",
    location_type: "restaurant",
  },
  {
    id: "restaurant-2",
    name: "Restaurant Two",
    restaurant_name: "Restaurant Two",
    location_type: "restaurant",
  },
];

const activityRows: EnterpriseLocation[] = [
  {
    id: "activity-1",
    name: "Activity One",
    activity_name: "Activity One",
    location_type: "activity",
  },
  {
    id: "activity-2",
    name: "Activity Two",
    activity_name: "Activity Two",
    location_type: "activity",
  },
];

describe("candidate retrieval contract", () => {
  it("builds a versioned request from the canonical SearchIntent", () => {
    const intent = mixedIntent();

    const request = createCandidateSearchRequest({
      requestId: "request-1",
      query: intent.rawQuery,
      intent,
      selectedMarketId: "NYC",
      restaurantLimit: 20,
      activityLimit: 15,
    });

    expect(request.contractVersion).toBe(
      SEARCH_CANDIDATE_CONTRACT_VERSION,
    );

    expect(request.intent.needsRestaurant).toBe(true);
    expect(request.intent.needsActivity).toBe(true);
    expect(request.market.selectedMarketId).toBe("NYC");
    expect(request.restaurantLimit).toBe(20);
    expect(request.activityLimit).toBe(15);
  });

  it("retrieves only the domains requested by intent", async () => {
    const searchLane = vi.fn(
      async (
        _supabase,
        _intent,
        domain,
      ): Promise<EnterpriseLocation[]> => {
        return domain === "restaurant"
          ? restaurantRows
          : activityRows;
      },
    );

    const request = createCandidateSearchRequest({
      requestId: "restaurant-only-request",
      query: "Italian dinner in Astoria",
      intent: restaurantIntent(),
    });

    const response = await retrieveSearchCandidates(
      {
        supabase: {} as never,
        request,
        debug: {
          rpcCalls: [],
          errors: [],
        },
      },
      {
        searchLane,
      },
    );

    expect(searchLane).toHaveBeenCalledTimes(1);
    expect(searchLane).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        needsRestaurant: true,
        needsActivity: false,
      }),
      "restaurant",
      expect.anything(),
    );

    expect(response.restaurants).toHaveLength(2);
    expect(response.activities).toHaveLength(0);
  });

  it("retrieves restaurant and activity lanes through one adapter", async () => {
    const searchLane = vi.fn(
      async (
        _supabase,
        _intent,
        domain,
      ): Promise<EnterpriseLocation[]> => {
        return domain === "restaurant"
          ? restaurantRows
          : activityRows;
      },
    );

    const request = createCandidateSearchRequest({
      requestId: "mixed-request",
      query: "Steak dinner and rooftop drinks",
      intent: mixedIntent(),
    });

    const response = await retrieveSearchCandidates(
      {
        supabase: {} as never,
        request,
        debug: {
          rpcCalls: [],
          errors: [],
        },
      },
      {
        searchLane,
      },
    );

    expect(searchLane).toHaveBeenCalledTimes(2);
    expect(response.restaurants).toEqual(restaurantRows);
    expect(response.activities).toEqual(activityRows);
    expect(response.metadata.provider).toBe("app");
    expect(response.metadata.candidateFallbackUsed).toBe(false);

    expect(() =>
      validateCandidateSearchResponse(
        response,
        "mixed-request",
      ),
    ).not.toThrow();
  });

  it("applies bounded candidate limits without changing ranking", async () => {
    const searchLane = vi.fn(
      async (
        _supabase,
        _intent,
        domain,
      ): Promise<EnterpriseLocation[]> => {
        return domain === "restaurant"
          ? restaurantRows
          : activityRows;
      },
    );

    const request = createCandidateSearchRequest({
      requestId: "bounded-request",
      query: "Dinner and an activity",
      intent: mixedIntent(),
      restaurantLimit: 1,
      activityLimit: 1,
    });

    const response = await retrieveSearchCandidates(
      {
        supabase: {} as never,
        request,
      },
      {
        searchLane,
      },
    );

    expect(response.restaurants).toEqual([
      restaurantRows[0],
    ]);

    expect(response.activities).toEqual([
      activityRows[0],
    ]);

    expect(response.metadata.truncated).toBe(true);
    expect(response.metadata.restaurantTruncated).toBe(true);
    expect(response.metadata.activityTruncated).toBe(true);
  });

  it("rejects an incompatible contract version", async () => {
    const request = {
      ...createCandidateSearchRequest({
        requestId: "bad-version-request",
        query: "Dinner",
        intent: restaurantIntent(),
      }),
      contractVersion: "candidate-search-v999",
    } as unknown as CandidateSearchRequest;

    await expect(
      retrieveSearchCandidates(
        {
          supabase: {} as never,
          request,
        },
        {
          searchLane: vi.fn(),
        },
      ),
    ).rejects.toBeInstanceOf(
      SearchCandidateContractVersionError,
    );
  });

  it("records production-safe candidate telemetry", async () => {
    const debug: Record<string, unknown> = {
      rpcCalls: [],
      errors: [],
    };

    const response = await retrieveSearchCandidates(
      {
        supabase: {} as never,
        request: createCandidateSearchRequest({
          requestId: "telemetry-request",
          query: "Dinner and bowling",
          intent: mixedIntent(),
        }),
        debug,
      },
      {
        searchLane: async (
          _supabase,
          _intent,
          domain,
        ) =>
          domain === "restaurant"
            ? restaurantRows
            : activityRows,
        now: monotonicClock([
          0,
          10,
          20,
          30,
          40,
          50,
        ]),
      },
    );

    applyCandidateRetrievalTelemetry(debug, response);

    expect(debug).toMatchObject({
      candidateProvider: "app",
      candidateContractVersion:
        SEARCH_CANDIDATE_CONTRACT_VERSION,
      candidateFallbackUsed: false,
      candidateRestaurantCount: 2,
      candidateActivityCount: 2,
    });
  });

  it("does not allow a mismatched response request id", () => {
    expect(() =>
      validateCandidateSearchResponse(
        {
          contractVersion:
            SEARCH_CANDIDATE_CONTRACT_VERSION,
          requestId: "actual-request",
          restaurants: [],
          activities: [],
          timing: {
            totalMs: 1,
            restaurantQueryMs: null,
            activityQueryMs: null,
          },
          metadata: {
            provider: "app",
            truncated: false,
            restaurantTruncated: false,
            activityTruncated: false,
            candidateFallbackUsed: false,
          },
        },
        "expected-request",
      ),
    ).toThrow(/requestId mismatch/i);
  });
});

function restaurantIntent(): SearchIntent {
  return {
    rawQuery: "Italian dinner in Astoria",
    searchType: "restaurant",
    primaryDomain: "restaurant",
    needsRestaurant: true,
    needsActivity: false,
    wantsPairing: false,
    restaurantIntent: {
      mealTerms: ["dinner"],
      foodTerms: [],
      cuisineTerms: ["italian"],
      categoryTerms: ["restaurant"],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    activityIntent: {
      activityTerms: [],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    geo: {
      raw: "Astoria",
      neighborhood: "Astoria",
      city: "New York",
      borough: "Queens",
      county: "Queens",
      region: "NYC",
      state: "NY",
      aliases: [],
      latitude: 40.7644,
      longitude: -73.9235,
      radiusMiles: 5,
      geoStrictness: "strict",
      requestedMarket: "NYC",
      resolvedMarket: "NYC",
      explicitMarketRequested: true,
    },
    vibe: [],
    strictness: "high",
  };
}

function mixedIntent(): SearchIntent {
  return {
    rawQuery: "Steak dinner and rooftop drinks",
    searchType: "mixed_outing",
    primaryDomain: "mixed",
    needsRestaurant: true,
    needsActivity: true,
    wantsPairing: true,
    pairingIntent: "nearby_pair",
    pairingPreference: {
      requiresPairing: true,
      distanceMode: "walking",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: 30,
      requireWalkablePair: true,
    },
    restaurantIntent: {
      mealTerms: ["dinner"],
      foodTerms: ["steak"],
      cuisineTerms: ["steakhouse"],
      categoryTerms: ["restaurant"],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    activityIntent: {
      activityTerms: ["rooftop drinks"],
      categoryTerms: ["rooftop bar"],
      vibeTerms: [],
      featureTerms: ["views"],
      negativeTerms: [],
      alternativeGroups: [],
    },
    geo: {
      raw: "NYC",
      neighborhood: null,
      city: "New York",
      borough: null,
      county: null,
      region: "NYC",
      state: "NY",
      aliases: [],
      latitude: 40.758,
      longitude: -73.9855,
      radiusMiles: 45,
      geoStrictness: "default_market",
      requestedMarket: "NYC",
      resolvedMarket: "NYC",
      explicitMarketRequested: false,
    },
    vibe: [],
    strictness: "high",
  };
}

function monotonicClock(values: number[]): () => number {
  let index = 0;

  return () => {
    const value =
      values[index] ??
      values[values.length - 1] ??
      0;

    index += 1;

    return value;
  };
}