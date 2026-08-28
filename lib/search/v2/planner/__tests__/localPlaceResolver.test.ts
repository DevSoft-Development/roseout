import { describe, expect, it } from "vitest";
import { MARKET_ALIASES } from "../../../../location-markets";
import { buildSearchPlan } from "../buildSearchPlan";
import { deterministicParse } from "../deterministicParser";
import { SEARCH_V2_LOCAL_MARKETS } from "../localPlaceResolver";

const configuredLocalAliases = SEARCH_V2_LOCAL_MARKETS.flatMap((market) =>
  MARKET_ALIASES[market].map((alias) => [market, alias] as const),
);

describe("Search V2 local place resolution", () => {
  it.each(configuredLocalAliases)(
    "recognizes every configured %s alias as geography: %s",
    (market, alias) => {
      const parsed = deterministicParse({
        query: `restaurant in ${alias}`,
        requestId: `local-geo-${market}-${alias}`,
      });

      expect(parsed.place, `${alias} should resolve as a local place`).not.toBeNull();
    },
  );

  it("treats the Bronx as borough geography instead of restaurant evidence", async () => {
    const plan = await buildSearchPlan({
      input: {
        query: "restaurant with hookah in the Bronx",
        requestId: "bronx-hookah-regression",
      },
    });

    expect(plan.geo.borough).toBe("Bronx");
    expect(plan.geo.market).toBe("NYC");
    expect(plan.restaurant.foods.join(" ").toLowerCase()).not.toContain("bronx");
  });

  it.each([
    ["lobster ravioli in Riverdale", "Riverdale", "NYC"],
    ["lobster ravioli in Staten Island", "Staten Island", "NYC"],
    ["lobster ravioli in Garden City", "Garden City", "LONG_ISLAND"],
    ["lobster ravioli in White Plains", "White Plains", "WESTCHESTER"],
    ["lobster ravioli in Jersey City", "Jersey City", "NORTHERN_NJ"],
    ["lobster ravioli in Stamford", "Stamford", "CONNECTICUT"],
  ])(
    "keeps real dish wording while stripping local geography for %s",
    async (query, expectedPlace, expectedMarket) => {
      const plan = await buildSearchPlan({
        input: {
          query,
          requestId: `local-dish-${expectedMarket}-${expectedPlace}`,
          selectedLane: "restaurant",
        },
      });

      expect(plan.geo.market).toBe(expectedMarket);
      expect(
        [plan.geo.neighborhood, plan.geo.borough, plan.geo.city, plan.geo.county]
          .filter(Boolean)
          .join(" "),
      ).toContain(expectedPlace);
      expect(plan.restaurant.foods).toContain("lobster ravioli");
      expect(plan.restaurant.foods.join(" ").toLowerCase()).not.toContain(
        expectedPlace.toLowerCase(),
      );
    },
  );
});
