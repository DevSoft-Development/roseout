import { describe, expect, it } from "vitest";
import { calculateLocationMlScore } from "./locationRanking";

describe("calculateLocationMlScore", () => {
  it("returns 0 for zero data", () => {
    expect(calculateLocationMlScore({})).toBe(0);
  });

  it("scores high engagement and conversion above weak engagement", () => {
    const weak = calculateLocationMlScore({ impressions_30d: 100, views_30d: 10, clicks_30d: 1 });
    const strong = calculateLocationMlScore({ impressions_30d: 100, views_30d: 80, clicks_30d: 40, reservation_clicks_30d: 12, saves_30d: 10, completed_outings_30d: 5 });
    expect(strong).toBeGreaterThan(weak);
  });

  it("dampens low sample sizes", () => {
    const low = calculateLocationMlScore({ impressions_30d: 9, views_30d: 9, clicks_30d: 8, reservation_clicks_30d: 4 });
    const full = calculateLocationMlScore({ impressions_30d: 30, views_30d: 9, clicks_30d: 8, reservation_clicks_30d: 4 });
    expect(low).toBeLessThan(full);
  });

  it("reduces score for negative signals", () => {
    const clean = calculateLocationMlScore({ impressions_30d: 100, views_30d: 40, clicks_30d: 20, saves_30d: 10 });
    const negative = calculateLocationMlScore({ impressions_30d: 100, views_30d: 40, clicks_30d: 20, saves_30d: 10, negative_signals_30d: 5 });
    expect(negative).toBeLessThan(clean);
  });

  it("stays between 0 and 100", () => {
    expect(calculateLocationMlScore({ impressions_30d: 10000, views_30d: 10000, clicks_30d: 10000, reservation_clicks_30d: 10000, saves_30d: 10000, completed_outings_30d: 10000, quality_component: 100 })).toBeLessThanOrEqual(100);
    expect(calculateLocationMlScore({ impressions_30d: 100, negative_signals_30d: 1000 })).toBeGreaterThanOrEqual(0);
  });
});
