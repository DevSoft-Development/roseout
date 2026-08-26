import { describe, expect, it } from "vitest";
import { collectQaQueryMetrics, summarizeQaBatchDiversity } from "./qaBatchMetrics";

describe("QA batch diversity metrics", () => {
  it("measures unique venue exposure and repeated subsets across queries", () => {
    const rows = [
      collectQaQueryMetrics({
        query: "date night in Brooklyn",
        elapsedMs: 1200,
        result: {
          timing: { totalMs: 1100 },
          restaurants: [{ id: "r1" }, { id: "r2" }],
          activities: [{ id: "a1" }, { id: "a2" }],
          pairs: [{ restaurant: { id: "r1" }, activity: { id: "a1" } }],
        },
      }),
      collectQaQueryMetrics({
        query: "romantic date night in Brooklyn",
        elapsedMs: 2500,
        result: {
          timing: { totalMs: 2400 },
          restaurants: [{ id: "r1" }, { id: "r3" }],
          activities: [{ id: "a1" }, { id: "a3" }],
          pairs: [{ restaurant: { id: "r1" }, activity: { id: "a1" } }],
        },
      }),
    ];

    const summary = summarizeQaBatchDiversity(rows);
    expect(summary.restaurants.exposureCount).toBe(4);
    expect(summary.restaurants.uniqueCount).toBe(3);
    expect(summary.restaurants.repetitionRate).toBe(0.25);
    expect(summary.activities.exposureCount).toBe(4);
    expect(summary.activities.uniqueCount).toBe(3);
    expect(summary.allVenues.uniqueCount).toBe(6);
    expect(summary.latency.p50Ms).toBe(1750);
    expect(summary.latency.maxMs).toBe(2400);
    expect(summary.latency.over2sCount).toBe(1);
  });

  it("counts pair-only venue identities when standalone arrays are absent", () => {
    const row = collectQaQueryMetrics({
      query: "dinner then bowling",
      elapsedMs: 900,
      result: {
        pairs: [
          { restaurant: { location_id: "r1" }, activity: { linkedLocationId: "a1" } },
          { restaurant: { location_id: "r2" }, activity: { linkedLocationId: "a2" } },
        ],
      },
    });
    expect(row.uniquePairRestaurantCount).toBe(2);
    expect(row.uniquePairActivityCount).toBe(2);
    expect(row.uniqueVenueCount).toBe(4);
  });
});
