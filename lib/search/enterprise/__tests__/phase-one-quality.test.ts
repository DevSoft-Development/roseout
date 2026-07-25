import { describe, expect, it } from "vitest";

import {
  buildSearchScoreBreakdown,
  detectSearchInterpretation,
  evaluateTemporalFeasibility,
  resolveRouteEvidence,
} from "../phaseOneQuality";

const baseIntent = {
  rawQuery: "dinner then bowling nearby",
  wantsPairing: true,
  pairRequested: true,
  pairingIntent: "nearby_pair",
  sameLocationRequired: false,
  restaurantIntent: {
    cuisineTerms: ["italian"],
    foodTerms: ["dinner"],
    mealTerms: ["dinner"],
  },
  activityIntent: {
    activityTerms: ["bowling"],
    alternativeGroups: [],
  },
  vibe: ["casual"],
  occasion: "date night",
  geo: {},
} as any;

describe("phase one search quality utilities", () => {
  it("detects explicit two-stop outing language", () => {
    const result = detectSearchInterpretation(baseIntent);

    expect(result.interpretation).toBe("two_stop");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("prefers verified route evidence over estimates", () => {
    const result = resolveRouteEvidence({
      googleWalkingDurationMinutes: 12,
      routeDurationMinutes: 18,
      pairWalkingMinutes: 20,
    } as any);

    expect(result).toEqual({
      source: "google",
      confidence: "verified",
      walkingMinutes: 12,
    });
  });

  it("marks a pair infeasible when the activity closes before arrival", () => {
    const result = evaluateTemporalFeasibility({
      outingDateTimeISO: "2026-07-25T18:00:00.000Z",
      mealDurationMinutes: 90,
      arrivalBufferMinutes: 10,
      pair: {
        restaurant: { id: "restaurant-1" },
        activity: { id: "activity-1", closing_time: "19:00" },
        googleWalkingDurationMinutes: 15,
      } as any,
    });

    expect(result.status).toBe("infeasible");
    expect(result.reason).toBe("activity_closed_before_arrival");
  });

  it("returns an auditable score breakdown", () => {
    const result = buildSearchScoreBreakdown(
      {
        id: "restaurant-1",
        name: "Casual Italian Date Night",
        cuisine: "Italian",
        tags: ["dinner", "casual"],
        match_score: 20,
        ml_score: 10,
        geo_score: 5,
        quality_score: 8,
        popularity_score: 4,
        review_count: 200,
        active: true,
        is_searchable: true,
        is_hidden: false,
      } as any,
      baseIntent,
    );

    expect(result.cuisineMatch).toBe(30);
    expect(result.occasionMatch).toBe(15);
    expect(result.personalization).toBe(10);
    expect(result.final).toBe(
      result.lexical +
        result.semantic +
        result.cuisineMatch +
        result.activityMatch +
        result.occasionMatch +
        result.geoMatch +
        result.quality +
        result.popularity +
        result.availability +
        result.personalization +
        result.penalties,
    );
  });
});
