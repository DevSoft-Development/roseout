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

  it.each([
    "date night in Long Island",
    "dinner and activity on Long Island",
    "brunch near Long Island",
    "date night in Nassau County",
    "things to do in Suffolk",
  ])("parses %s as Long Island", (query) => {
    const result = detectRequestedMarket(query);
    expect(result.resolvedMarket).toBe("LONG_ISLAND");
    expect(result.state).toBe("NY");
  });

  it.each([
    "date night in Long Island City",
    "date night in Long Island City Queens",
    "date night in Long Island City NY",
    "date night in LIC",
  ])("parses %s as NYC Core Queens, not Long Island", (query) => {
    const result = detectRequestedMarket(query);
    expect(result.resolvedMarket).toBe("NYC_CORE");
    expect(result.borough).toBe("Queens");
  });

  it("does not let the generic word island trigger Long Island", () => {
    expect(detectRequestedMarket("island vibes").marketIntent).toBe("default");
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
