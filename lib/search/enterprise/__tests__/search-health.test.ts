import { describe, expect, it } from "vitest";
import {
  buildSearchHealthEventPayload,
  classifySearchHealthEvent,
  shouldLogSearchHealthEvent,
} from "../searchHealthLogger";

const walkingNoPair = {
  source: "public_create_search",
  restaurant_count: 6,
  activity_count: 12,
  pair_count: 0,
  wantsPairing: true,
  needsActivity: true,
  distanceMode: "walking",
  requireWalkablePair: true,
  no_pairs_reason: "no_pairs_within_walking_distance",
};

describe("enterprise Search Health classification", () => {
  it("logs public no-valid-walking-pair warnings", () => {
    expect(shouldLogSearchHealthEvent(walkingNoPair)).toBe(true);
    expect(classifySearchHealthEvent(walkingNoPair)).toEqual({
      eventType: "no_valid_pairs",
      severity: "warning",
      eventLabel: "No valid pairs within walking distance",
    });
  });

  it("does not log public clean success", () => {
    expect(
      shouldLogSearchHealthEvent({
        source: "public_create_search",
        restaurant_count: 12,
        activity_count: 12,
        pair_count: 8,
        speed_status: "good",
        errors: [],
        warnings: [],
      }),
    ).toBe(false);
  });

  it("logs admin Search Lab debug runs", () => {
    const input = {
      source: "admin_search_lab",
      debugMode: true,
      pair_count: 8,
    };
    expect(shouldLogSearchHealthEvent(input)).toBe(true);
    expect(classifySearchHealthEvent(input).eventType).toBe(
      "successful_debug_run",
    );
    expect(classifySearchHealthEvent(input).severity).toBe("info");
  });

  it("classifies no activity results", () => {
    expect(
      classifySearchHealthEvent({
        restaurant_count: 6,
        activity_count: 0,
        needsActivity: true,
      }),
    ).toEqual({
      eventType: "no_activity_results",
      severity: "warning",
      eventLabel: "No activity results",
    });
  });

  it("classifies no restaurant results", () => {
    expect(classifySearchHealthEvent({ restaurant_count: 0 })).toEqual({
      eventType: "no_restaurant_results",
      severity: "warning",
      eventLabel: "No restaurant results",
    });
  });

  it("classifies slow search", () => {
    expect(
      classifySearchHealthEvent({
        restaurant_count: 3,
        timing_ms: 4000,
        speed_status: "slow",
      }),
    ).toEqual({
      eventType: "slow_search",
      severity: "warning",
      eventLabel: "Slow search",
    });
  });

  it("limits debug preview arrays in payload", () => {
    const many = Array.from({ length: 100 }, (_, index) => ({ index }));
    const payload = buildSearchHealthEventPayload({
      source: "admin_search_lab",
      debugMode: true,
      debug: {
        rejectedPairs: many,
        restaurantQualityScorePreview: many,
        activityQualityScorePreview: many,
        pairQualityScorePreview: many,
      },
    });
    expect((payload.debug as any).rejectedPairs.length).toBe(25);
    expect((payload.debug as any).restaurantQualityScorePreview.length).toBe(
      12,
    );
    expect((payload.debug as any).activityQualityScorePreview.length).toBe(12);
    expect((payload.debug as any).pairQualityScorePreview.length).toBe(12);
  });

  it("stores admin visibility fields in debug payload", () => {
    const payload = buildSearchHealthEventPayload({
      source: "public_create_search",
      result: {
        restaurants: [{}],
        activities: [{}],
        pairs: [],
        render_mode: "partial_mixed",
      },
      debug: {
        rawQuery: "sushi and bowling in Queens under 10 minute walk",
        route: "/api/generate",
        intentParserSource: "fast_path",
        fastPathMatched: true,
        fastPathReason: "activity_fast_path",
        normalizedIntent: {
          rawQuery: "sushi and bowling in Queens under 10 minute walk",
          searchType: "mixed_pairs",
          primaryDomain: "restaurant",
          wantsPairing: true,
          restaurantIntent: {
            mealTerms: ["dinner"],
            foodTerms: ["sushi"],
            cuisineTerms: ["japanese"],
            categoryTerms: ["restaurant"],
            vibeTerms: ["casual"],
            featureTerms: ["date night"],
          },
          activityIntent: {
            activityTerms: ["bowling"],
            categoryTerms: ["games"],
            vibeTerms: ["fun"],
            featureTerms: ["indoor"],
          },
          geo: {
            raw: "Queens",
            borough: "Queens",
            city: "New York",
            state: "NY",
            latitude: 40.7,
            longitude: -73.8,
            radiusMiles: 8,
            geoStrictness: "strict",
          },
          pairingPreference: {
            requiresPairing: true,
            distanceMode: "walking",
            maxPairDistanceMiles: 0.5,
            maxPairWalkingMinutes: 10,
            requireWalkablePair: true,
          },
        },
        geo: {
          raw: "Queens",
          borough: "Queens",
          city: "New York",
          state: "NY",
          latitude: 40.7,
          longitude: -73.8,
          radiusMiles: 8,
          geoStrictness: "strict",
        },
        pairCandidatesEvaluated: 12,
        validPairCountBeforeRender: 0,
        pairsRejectedForDistance: 7,
        pairsRejectedForMissingCoordinates: 2,
        extremeWalkingRoutesRejected: 1,
        rejectedPairs: [{ reason: "walking_route_exceeds_requested_minutes" }],
        performance: {
          intent_parse_ms: 10,
          llm_ms: 0,
          rpc_ms: 120,
          pairing_ms: 20,
          ranking_ms: 5,
          route_check_ms: 3,
          total_ms: 200,
        },
      },
    });

    const debug = payload.debug as any;
    expect(debug.route).toBe("/api/generate");
    expect(debug.intentParserSource).toBe("fast_path");
    expect(debug.searchTerms.restaurant.foodTerms).toContain("sushi");
    expect(debug.searchTerms.activity.activityTerms).toContain("bowling");
    expect(debug.geo.borough).toBe("Queens");
    expect(debug.pairingPreference.maxPairWalkingMinutes).toBe(10);
    expect(debug.counts.pairCandidatesEvaluated).toBe(12);
    expect(debug.rejectionReasons.walking_route_exceeds_requested_minutes).toBe(
      1,
    );
    expect(debug.rejectionReasons.pair_distance_exceeds_requested_max).toBe(7);
    expect(debug.rejectionReasons.missing_coordinates).toBe(2);
    expect(debug.performance.route_check_ms).toBe(3);
  });
});
