import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";

describe("Search V2 ZIP geography", () => {
  it("uses canonical ZIP geography as the search center", async () => {
    const plan = await buildSearchPlan({
      input: {
        query: "sushi near 11530",
        resolvedGeo: {
          zipCode: "11530",
          city: "Garden City",
          county: "Nassau County",
          state: "NY",
          market: "LONG_ISLAND",
          latitude: 40.7268,
          longitude: -73.6343,
          radiusMiles: 5,
          source: "zip",
        },
      },
    });
    expect(plan.geo.source).toBe("zip");
    expect(plan.geo.zipCode).toBe("11530");
    expect(plan.geo.city).toBe("Garden City");
    expect(plan.geo.county).toBe("Nassau County");
    expect(plan.geo.market).toBe("LONG_ISLAND");
    expect(plan.geo.latitude).toBe(40.7268);
    expect(plan.geo.longitude).toBe(-73.6343);
    expect(plan.restaurant.cuisines).toContain("sushi");
  });
});
