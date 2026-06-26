import { describe, expect, it } from "vitest";
import { detectRequestedMarket, inferMarketFromCityStateCounty } from "../location-markets";
import { getZipMarketMapping } from "../zip-market-mapping";

describe("Westchester market mapping", () => {
  it.each(["White Plains", "Yonkers", "New Rochelle", "Mount Vernon", "Scarsdale", "Port Chester", "Rye", "Tarrytown"])(
    "maps %s to Westchester",
    (city) => {
      expect(inferMarketFromCityStateCounty({ city, state: "NY" })).toBe("WESTCHESTER");
      expect(detectRequestedMarket(`dinner in ${city}`).resolvedMarket).toBe("WESTCHESTER");
    },
  );

  it("maps Westchester zip prefixes and exact zips", () => {
    expect(getZipMarketMapping("10601")?.marketArea).toBe("Westchester");
    expect(getZipMarketMapping("10701")?.marketArea).toBe("Westchester");
    expect(getZipMarketMapping("10580")?.city).toBe("Rye");
  });
});
