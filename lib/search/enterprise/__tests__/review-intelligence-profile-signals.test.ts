import { describe, expect, it } from "vitest";

import { deriveReviewProfileSignals } from "@/lib/search/reviewIntelligenceProfileSignals";

describe("deriveReviewProfileSignals", () => {
  it("returns null without review intelligence", () => {
    expect(deriveReviewProfileSignals([])).toBeNull();
  });

  it("maps positive intent concepts into review ML-compatible signals", () => {
    const result = deriveReviewProfileSignals([
      {
        concept: "romantic",
        lifetime_count: 20,
        trailing_90d_count: 10,
        positive_ratio: 0.9,
        negative_ratio: 0,
        confidence: 0.8,
        updated_at: "2026-10-06T12:00:00Z",
      },
      {
        concept: "quiet",
        lifetime_count: 12,
        trailing_90d_count: 4,
        positive_ratio: 0.85,
        negative_ratio: 0.05,
        confidence: 0.7,
        updated_at: "2026-10-06T12:00:00Z",
      },
      {
        concept: "groups",
        lifetime_count: 15,
        trailing_90d_count: 5,
        positive_ratio: 0.8,
        negative_ratio: 0.05,
        confidence: 0.75,
        updated_at: "2026-10-06T12:00:00Z",
      },
      {
        concept: "cocktails",
        lifetime_count: 10,
        trailing_90d_count: 3,
        positive_ratio: 0.85,
        negative_ratio: 0,
        confidence: 0.7,
        updated_at: "2026-10-06T12:00:00Z",
      },
    ]) as Record<string, any>;

    expect(result.romantic_score).toBeGreaterThan(55);
    expect(result.quiet_score).toBeGreaterThan(55);
    expect(result.group_score).toBeGreaterThan(55);
    expect(result.date_night_score).toBe(result.romantic_score);
    expect(result.girls_night_score).toBeGreaterThan(40);
    expect(result.best_for_terms).toEqual(
      expect.arrayContaining(["romantic", "quiet", "groups", "cocktails"]),
    );
    expect(result.review_confidence_score).toBe(80);
  });

  it("turns negative concepts into penalties and avoid terms", () => {
    const result = deriveReviewProfileSignals([
      {
        concept: "noise",
        lifetime_count: 18,
        trailing_90d_count: 9,
        positive_ratio: 0.1,
        negative_ratio: 0.8,
        confidence: 0.75,
      },
      {
        concept: "value",
        lifetime_count: 14,
        trailing_90d_count: 7,
        positive_ratio: 0.15,
        negative_ratio: 0.7,
        confidence: 0.7,
      },
      {
        concept: "service",
        lifetime_count: 12,
        trailing_90d_count: 4,
        positive_ratio: 0.2,
        negative_ratio: 0.65,
        confidence: 0.65,
      },
    ]) as Record<string, any>;

    expect(result.noise_penalty).toBeGreaterThan(40);
    expect(result.overpriced_penalty).toBeGreaterThan(40);
    expect(result.service_penalty).toBeGreaterThan(35);
    expect(result.avoid_if_terms).toEqual(
      expect.arrayContaining(["noise", "value", "service"]),
    );
  });
});
