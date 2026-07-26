import { describe, expect, it } from "vitest";
import {
  SEARCH_EXPLANATION_LIMITS,
  serializeSearchRankingExplanations,
} from "../explainability";

const evidence = (overrides: Record<string, unknown> = {}) => ({
  id: "internal-location-uuid",
  oldRank: 4,
  newRank: 1,
  scoreDelta: 8.25,
  status: "ranking_applied",
  breakdown: {
    lexical: 10,
    semantic: 9,
    cuisineMatch: 8,
    activityMatch: 0,
    occasionMatch: 4,
    geoMatch: 7,
    quality: 6,
    popularity: 5,
    availability: 3,
    personalization: 2,
    penalties: -6,
    final: 48,
    email: "private@example.com",
  },
  email: "owner@example.com",
  phone: "555-0100",
  address: "1 Private Street",
  userId: "raw-user-id",
  unrestrictedResult: { secret: true },
  ...overrides,
});

describe("production search ranking explanations", () => {
  it("serializes location evidence, penalties, and rank movement", () => {
    const result = serializeSearchRankingExplanations({
      mode: "enabled",
      interpretation: "two_stop",
      restaurants: [evidence()],
      activities: [evidence({ oldRank: 1, newRank: 2, scoreDelta: -3 })],
    });

    expect(result.rankingApplied).toBe(true);
    expect(result.searchQualityRanking.mode).toBe("enabled");
    expect(result.searchExplanations).toEqual(expect.arrayContaining([
      expect.objectContaining({ resultType: "restaurant", rankMovement: 3 }),
      expect.objectContaining({ resultType: "activity", rankMovement: -1 }),
    ]));
    expect(result.searchQualityRanking.restaurants[0].breakdown?.penalties).toBe(-6);
  });

  it("serializes pair rank and rejected-pair explanations", () => {
    const result = serializeSearchRankingExplanations({
      mode: "shadow",
      pairs: [evidence({ status: "shadow_only" })],
      rejectedPairs: [{ id: "db-pair-id", reason: "activity closed before arrival" }],
    });

    expect(result.rankingApplied).toBe(false);
    expect(result.searchQualityRanking.pairs[0]).toMatchObject({ resultType: "pair", status: "shadow_only" });
    expect(result.searchQualityRanking.rejectedPairs[0]).toMatchObject({
      status: "rejected",
      reason: "activity_closed_before_arrival",
    });
  });

  it("bounds payloads and removes sensitive and unrestricted fields", () => {
    const many = Array.from({ length: 100 }, () => evidence());
    const result = serializeSearchRankingExplanations({
      mode: "enabled",
      restaurants: many,
      activities: many,
      pairs: many,
      rejectedPairs: many,
    });
    expect(result.searchQualityRanking.restaurants).toHaveLength(SEARCH_EXPLANATION_LIMITS.perResultType);
    expect(result.searchQualityRanking.activities).toHaveLength(SEARCH_EXPLANATION_LIMITS.perResultType);
    expect(result.searchQualityRanking.pairs).toHaveLength(SEARCH_EXPLANATION_LIMITS.perResultType);
    expect(result.searchQualityRanking.rejectedPairs).toHaveLength(SEARCH_EXPLANATION_LIMITS.rejectedPairs);
    const json = JSON.stringify(result);
    expect(json).not.toContain("private@example.com");
    expect(json).not.toContain("555-0100");
    expect(json).not.toContain("Private Street");
    expect(json).not.toContain("raw-user-id");
    expect(json).not.toContain("internal-location-uuid");
    expect(json).not.toContain("unrestrictedResult");
  });

  it("handles missing debug evidence", () => {
    expect(serializeSearchRankingExplanations(undefined)).toMatchObject({
      rankingMode: "disabled",
      rankingApplied: false,
      searchExplanations: [],
    });
  });
});
