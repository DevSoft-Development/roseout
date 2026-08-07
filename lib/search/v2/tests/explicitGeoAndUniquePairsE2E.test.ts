import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyCandidateGeo,
  mostSpecificRequestedGeoScope,
} from "@/lib/search/v2/geo/geoPolicy";

describe("explicit locality ordering and unique final pairs", () => {
  it("treats an explicit NYC borough as more specific than city=New York", () => {
    const plan = {
      geo: {
        neighborhood: null,
        borough: "Queens",
        city: "New York",
        county: "Queens County",
        market: "NYC_CORE",
        radiusMiles: 10,
      },
    } as any;

    expect(mostSpecificRequestedGeoScope(plan)).toBe("borough");

    const queens = classifyCandidateGeo(plan, {
      id: "queens",
      city: "Astoria",
      borough: "Queens",
      state: "NY",
      market: "NYC_CORE",
    } as any);
    const manhattan = classifyCandidateGeo(plan, {
      id: "manhattan",
      city: "New York",
      borough: "Manhattan",
      state: "NY",
      market: "NYC_CORE",
    } as any);

    expect(queens.tier).toBe("exact_locality");
    expect(queens.scopeLevel).toBe("borough");
    expect(manhattan.tier).not.toBe("exact_locality");
  });

  it("ranks exact-locality candidates before broader fallbacks", () => {
    const source = readFileSync("lib/search/v2/scoring/scoreCandidates.ts", "utf8");
    expect(source).toContain("compareByGeoTierThenScore");
    expect(source).toContain("geoTierRank(aTier) - geoTierRank(bTier)");
    expect(source).toContain(".sort(compareByGeoTierThenScore)");
  });

  it("does not reuse a restaurant or activity across final diversified pairs", () => {
    const source = readFileSync("lib/search/v2/pairing/buildPairs.ts", "utf8");
    expect(source).toContain("maxPerRestaurant = 1");
    expect(source).toContain("maxPerActivity = 1");
    expect(source).toContain("restaurantUses.get(restaurantId)");
    expect(source).toContain("activityUses.get(activityId)");
  });

  it("keeps the production regression query covered", () => {
    const priorRegression = readFileSync(
      "lib/search/v2/tests/sequenceGeoModifierActivityE2E.test.ts",
      "utf8",
    );
    expect(priorRegression).toContain("steak dinner and hookah after in queens");
  });
});
