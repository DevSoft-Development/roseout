import { describe, expect, it } from "vitest";
import { detectRequestedMarket } from "../../../location-markets";
import { inferMarketFromPlace, validatePlaceForMarket } from "../../../location-market-validation";

describe("shared market validation", () => {
  it("classifies Long Island City as NYC Core Queens", () => {
    const result = validatePlaceForMarket({ requestedMarket: "LONG_ISLAND", city: "Long Island City", state: "NY" });
    expect(result.inferredMarket).toBe("NYC_CORE");
    expect(result.borough).toBe("Queens");
    expect(result.ok).toBe(false);
  });

  it("parses LIC searches as NYC Core Queens", () => {
    const result = detectRequestedMarket("date night in LIC");
    expect(result.resolvedMarket).toBe("NYC_CORE");
    expect(result.borough).toBe("Queens");
  });

  it("parses Long Island searches as Long Island", () => {
    expect(detectRequestedMarket("date night in Long Island").resolvedMarket).toBe("LONG_ISLAND");
  });

  it.each([
    ["Newark, NJ", "NORTHERN_NJ"],
    ["Jersey City NJ", "NORTHERN_NJ"],
    ["Garden City NY", "LONG_ISLAND"],
    ["White Plains NY", "WESTCHESTER"],
    ["Staten Island NY", "STATEN_ISLAND"],
    ["City Island Bronx NY", "BRONX_OUTER"],
  ])("validates %s", (address, market) => {
    const result = validatePlaceForMarket({ requestedMarket: market, formattedAddress: address });
    expect(result.ok).toBe(true);
    expect(result.inferredMarket).toBe(market);
  });

  it.each(["Newark, DE", "Newark, CA"])("rejects %s for Northern Jersey", (address) => {
    const result = validatePlaceForMarket({ requestedMarket: "NORTHERN_NJ", formattedAddress: address });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("requires state NJ");
  });

  it("does not map Newark DE/CA parser queries to Northern Jersey", () => {
    expect(detectRequestedMarket("laser tag Newark DE").resolvedMarket).not.toBe("NORTHERN_NJ");
    expect(detectRequestedMarket("laser tag Newark CA").resolvedMarket).not.toBe("NORTHERN_NJ");
  });
});
