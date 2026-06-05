import { describe, expect, it } from "vitest";
import { buildSearchHealthEventPayload, classifySearchHealthEvent, shouldLogSearchHealthEvent } from "../searchHealthLogger";

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
    expect(classifySearchHealthEvent(walkingNoPair)).toEqual({ eventType: "no_valid_pairs", severity: "warning", eventLabel: "No valid pairs within walking distance" });
  });

  it("does not log public clean success", () => {
    expect(shouldLogSearchHealthEvent({ source: "public_create_search", restaurant_count: 12, activity_count: 12, pair_count: 8, speed_status: "good", errors: [], warnings: [] })).toBe(false);
  });

  it("logs admin Search Lab debug runs", () => {
    const input = { source: "admin_search_lab", debugMode: true, pair_count: 8 };
    expect(shouldLogSearchHealthEvent(input)).toBe(true);
    expect(classifySearchHealthEvent(input).eventType).toBe("successful_debug_run");
    expect(classifySearchHealthEvent(input).severity).toBe("info");
  });

  it("classifies no activity results", () => {
    expect(classifySearchHealthEvent({ restaurant_count: 6, activity_count: 0, needsActivity: true })).toEqual({ eventType: "no_activity_results", severity: "warning", eventLabel: "No activity results" });
  });

  it("classifies no restaurant results", () => {
    expect(classifySearchHealthEvent({ restaurant_count: 0 })).toEqual({ eventType: "no_restaurant_results", severity: "warning", eventLabel: "No restaurant results" });
  });

  it("classifies slow search", () => {
    expect(classifySearchHealthEvent({ restaurant_count: 3, timing_ms: 4000, speed_status: "slow" })).toEqual({ eventType: "slow_search", severity: "warning", eventLabel: "Slow search" });
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
    expect((payload.debug as any).restaurantQualityScorePreview.length).toBe(12);
    expect((payload.debug as any).activityQualityScorePreview.length).toBe(12);
    expect((payload.debug as any).pairQualityScorePreview.length).toBe(12);
  });
});
