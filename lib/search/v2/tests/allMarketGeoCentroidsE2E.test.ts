import { describe, expect, it } from "vitest";
import { GEO_TAXONOMY, normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import { buildSearchPlan } from "../planner/buildSearchPlan";

function finiteCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

describe("all-market geo centroid coverage", () => {
  it("requires every supported geography to have a valid centroid and radius", () => {
    expect(GEO_TAXONOMY.length).toBeGreaterThan(100);
    for (const record of GEO_TAXONOMY) {
      expect(finiteCoordinate(record.latitude), `${record.name} latitude`).toBe(true);
      expect(finiteCoordinate(record.longitude), `${record.name} longitude`).toBe(true);
      expect(record.latitude).toBeGreaterThanOrEqual(-90);
      expect(record.latitude).toBeLessThanOrEqual(90);
      expect(record.longitude).toBeGreaterThanOrEqual(-180);
      expect(record.longitude).toBeLessThanOrEqual(180);
      expect(record.defaultRadiusMiles).toBeGreaterThan(0);
      expect(normalizeGeoTerm(record.name)?.name).toBe(record.name);
    }
  });

  it.each([
    ["Sushi and an escape room near Garden City for four people", "Garden City", "Nassau County"],
    ["Affordable date night with Italian dinner and live music in Astoria tonight", "Astoria", "Queens County"],
    ["Halal restaurant and karaoke within a 20-minute walk in Flushing", "Flushing", "Queens County"],
    ["Dinner and bowling in Williamsburg", "Williamsburg", "Kings County"],
    ["Brunch in Hoboken", "Hoboken", "Hudson County"],
    ["Things to do in Stamford", "Stamford", "Fairfield County"],
  ])("propagates canonical centroid for %s", async (query, expectedPlace, expectedCounty) => {
    const plan = await buildSearchPlan({ input: { query } as any });
    const record = normalizeGeoTerm(expectedPlace)!;
    expect(plan.geo.latitude).toBe(record.latitude);
    expect(plan.geo.longitude).toBe(record.longitude);
    expect(plan.geo.radiusMiles).toBe(record.defaultRadiusMiles);
    expect(plan.geo.county).toBe(expectedCounty);
  });

  it("keeps neighborhood and city semantics separate", async () => {
    const astoria = await buildSearchPlan({ input: { query: "Italian dinner in Astoria" } as any });
    expect(astoria.geo.neighborhood).toBe("Astoria");
    expect(astoria.geo.city).toBe("New York");

    const gardenCity = await buildSearchPlan({ input: { query: "Sushi in Garden City" } as any });
    expect(gardenCity.geo.neighborhood).toBeNull();
    expect(gardenCity.geo.city).toBe("Garden City");
  });
});
