import { describe, expect, it } from "vitest";
import { rankBroadDateNightRestaurants } from "../fallback/resolveFallback";

function candidate(name: string, total: number, reason: string) {
  return {
    candidate: { candidate: { location: { id: name, name }, geoMatch: { tier: "exact_locality" } } },
    selectedRole: "restaurant",
    scores: { total },
    reasons: [reason],
    ml: {},
  } as any;
}

describe("broad date-night occasion-first restaurant selection", () => {
  it("keeps positive and neutral date fits ahead of higher-scoring weak quick-service concepts", () => {
    const ranked = rankBroadDateNightRestaurants([
      candidate("Nearby Pizza", 96, "date-night suitability demotion -18: quick-service concept evidence without sit-down date evidence"),
      candidate("Neutral Bistro", 72, "date-night suitability neutral; no suppressive service-style assumption"),
      candidate("Romantic Dining", 68, "date-night suitability boost +18: sit-down/full-service evidence, date-night ambiance evidence"),
    ]);

    expect(ranked.map((item) => item.candidate.candidate.location.name)).toEqual([
      "Romantic Dining",
      "Neutral Bistro",
      "Nearby Pizza",
    ]);
  });

  it("does not remove weak concepts; it only moves them behind better occasion fits", () => {
    const ranked = rankBroadDateNightRestaurants([
      candidate("Takeout Shop", 99, "date-night suitability demotion -32: takeout/counter/quick-service evidence"),
      candidate("Unknown Restaurant", 60, "date-night suitability neutral; no suppressive service-style assumption"),
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked[1].candidate.candidate.location.name).toBe("Takeout Shop");
  });
});
