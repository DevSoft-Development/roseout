import { describe, expect, it } from "vitest";
import { GOLDEN_SEARCH_QUERIES } from "./goldenQueries";
import { GEO_TAXONOMY } from "../enterprise/geo-taxonomy";
import { buildSearchPlan } from "../v2/planner/buildSearchPlan";
import { nearbyPairDistanceMiles } from "../v2/pairing/nearbyPairPolicy";

const nycAndLongIslandGeographies = GEO_TAXONOMY.filter((geo) =>
  geo.state === "NY" && (
    geo.city === "New York" ||
    Boolean(geo.borough) ||
    geo.region === "Long Island" ||
    geo.county === "Nassau County" ||
    geo.county === "Suffolk County" ||
    geo.name === "Long Island" ||
    geo.name === "Nassau County" ||
    geo.name === "Suffolk County"
  ),
);

describe("final supported-query gap", () => {
  it("keeps the exact failed Garden City query in the permanent golden suite", () => {
    const testCase = GOLDEN_SEARCH_QUERIES.find((item) => item.id === "pair-garden-city-escape");
    expect(testCase?.query).toBe("Sushi and an escape room in Garden City");
    expect(testCase?.expectations.minimumPairs).toBe(1);
    expect(testCase?.expectations.expectedDomains).toEqual(["restaurant", "activity"]);
  });

  it("allows a bounded six-mile nearby fallback for the Garden City query", async () => {
    const plan = await buildSearchPlan({ input: { query: "Sushi and an escape room in Garden City" } });
    expect(plan.geo.city).toBe("Garden City");
    expect(plan.geo.radiusMiles).toBe(6);
    expect(plan.pairing.maxDistanceMiles).toBe(3);
    expect(plan.fallback.allowNearbyPair).toBe(true);
    expect(nearbyPairDistanceMiles(plan)).toBe(6);
  });

  it("covers every supported NYC and Long Island city, neighborhood, borough, county, and region", async () => {
    expect(nycAndLongIslandGeographies.length).toBeGreaterThan(100);
    for (const geo of nycAndLongIslandGeographies) {
      expect(Number.isFinite(geo.latitude), geo.name).toBe(true);
      expect(Number.isFinite(geo.longitude), geo.name).toBe(true);
      expect(geo.defaultRadiusMiles, geo.name).toBeGreaterThan(0);

      const plan = await buildSearchPlan({ input: { query: `Dinner and an activity in ${geo.name}` } });
      expect(plan.geo.latitude, geo.name).toBe(geo.latitude);
      expect(plan.geo.longitude, geo.name).toBe(geo.longitude);
      expect(plan.geo.radiusMiles, geo.name).toBe(geo.defaultRadiusMiles);
      expect(plan.fallback.allowNearbyPair, geo.name).toBe(true);

      const fallbackMiles = nearbyPairDistanceMiles(plan);
      expect(fallbackMiles, geo.name).not.toBeNull();
      expect(fallbackMiles!, geo.name).toBeLessThanOrEqual(6);
      expect(fallbackMiles!, geo.name).toBeLessThanOrEqual(geo.defaultRadiusMiles);
    }
  });

  it("never relaxes explicit walking constraints across NYC and Long Island", async () => {
    for (const geo of nycAndLongIslandGeographies) {
      const plan = await buildSearchPlan({ input: { query: `Dinner and an activity in ${geo.name} within a 20-minute walk` } });
      expect(plan.pairing.requireWalkable, geo.name).toBe(true);
      expect(nearbyPairDistanceMiles(plan), geo.name).toBeNull();
    }
  });
});
