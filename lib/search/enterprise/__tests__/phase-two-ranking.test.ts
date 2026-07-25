import { describe, expect, it } from "vitest";
import { rankLocationsWithQualitySignals, rankPairsWithQualitySignals } from "../phaseTwoRanking";

const intent = {
  rawQuery: "italian dinner then bowling nearby",
  wantsPairing: true,
  pairRequested: true,
  pairingIntent: "nearby_pair",
  sameLocationRequired: false,
  restaurantIntent: { cuisineTerms: ["italian"], foodTerms: ["dinner"], mealTerms: ["dinner"] },
  activityIntent: { activityTerms: ["bowling"], alternativeGroups: [] },
  vibe: [],
  occasion: null,
  geo: {},
} as any;

describe("phase two live ranking", () => {
  it("ranks stronger location matches first", () => {
    const ranked = rankLocationsWithQualitySignals([
      { id: "weak", name: "Generic Place", match_score: 1, active: true, is_searchable: true } as any,
      { id: "strong", name: "Italian Dinner", cuisine: "Italian", match_score: 20, active: true, is_searchable: true } as any,
    ], intent);
    expect(ranked[0].id).toBe("strong");
    expect(ranked[0].searchScoreBreakdown.final).toBe(ranked[0].phaseTwoScore);
  });

  it("penalizes infeasible pairs", () => {
    const ranked = rankPairsWithQualitySignals({
      intent,
      outingDateTimeISO: "2026-07-25T18:00:00.000Z",
      pairs: [
        {
          restaurant: { id: "r1", name: "Italian Dinner", cuisine: "Italian", active: true, is_searchable: true },
          activity: { id: "a1", name: "Bowling", activity_type: "bowling", closing_time: "19:00", active: true, is_searchable: true },
          googleWalkingDurationMinutes: 20,
        },
        {
          restaurant: { id: "r2", name: "Italian Dinner", cuisine: "Italian", active: true, is_searchable: true },
          activity: { id: "a2", name: "Bowling", activity_type: "bowling", closing_time: "23:00", active: true, is_searchable: true },
          googleWalkingDurationMinutes: 10,
        },
      ] as any,
    });
    expect(ranked[0].activity.id).toBe("a2");
    expect(ranked[1].temporalFeasibility.status).toBe("infeasible");
  });
});
