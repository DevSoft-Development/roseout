import { describe, expect, it } from "vitest";
import { detectRequestedMarket, normalizeMarketKey } from "../../../location-markets";
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
    expect(result.resolvedMarket).toBe("NYC_CORE");
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
    expect(result.resolvedMarket).toBe("NYC_CORE");
  });

  it("does not let the generic word island trigger Long Island", () => {
    expect(detectRequestedMarket("island vibes").marketIntent).toBe("default");
  });

  it.each([
    ["Newark, NJ", "NORTHERN_NJ"],
    ["Jersey City NJ", "NORTHERN_NJ"],
    ["Garden City NY", "LONG_ISLAND"],
    ["White Plains NY", "WESTCHESTER"],
    ["Staten Island NY", "NYC_CORE"],
    ["City Island Bronx NY", "NYC_CORE"],
    ["Queens NY", "NYC_CORE"],
    ["Brooklyn NY", "NYC_CORE"],
    ["Manhattan NY", "NYC_CORE"],
    ["Long Island City NY", "NYC_CORE"],
    ["Nassau County NY", "LONG_ISLAND"],
    ["Suffolk County NY", "LONG_ISLAND"],
    ["Hoboken NJ", "NORTHERN_NJ"],
    ["Yonkers NY", "WESTCHESTER"],
    ["Stamford CT", "CONNECTICUT"],
    ["Norwalk CT", "CONNECTICUT"],
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


describe("market normalization", () => {
  it.each([
    ["BRONX_OUTER", "NYC_CORE"],
    ["STATEN_ISLAND", "NYC_CORE"],
    ["OUTER_NYC", "NYC_CORE"],
    ["NORTH_JERSEY", "NORTHERN_NJ"],
    ["NORTHERN_NJ", "NORTHERN_NJ"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeMarketKey(input)).toBe(expected);
  });

  it("allows supported inferred candidates when requested market is unknown", () => {
    const result = validatePlaceForMarket({ requestedMarket: "UNKNOWN", formattedAddress: "Astoria, NY" });
    expect(result.ok).toBe(true);
    expect(result.correctedMarket).toBe("NYC_CORE");
  });

  it("does not auto-mark truly unknown market rows searchable", () => {
    const result = validatePlaceForMarket({ requestedMarket: "UNKNOWN", formattedAddress: "Mystery Place" });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("UNKNOWN market cannot be auto-marked searchable");
  });
});
