import { beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeMarketKey } from "../location-markets";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({ delete: () => ({ gte: vi.fn() }), insert: vi.fn() }) }),
}));

type GooglePlacesImportModule = typeof import("../googlePlacesImport");
let googlePlacesImport: GooglePlacesImportModule;

beforeAll(async () => {
  googlePlacesImport = await import("../googlePlacesImport");
});

describe("Google Places import market normalization", () => {
  it.each([
    ["long_island", "LONG_ISLAND"],
    ["LONG_ISLAND", "LONG_ISLAND"],
    ["Long Island", "LONG_ISLAND"],
    ["long island", "LONG_ISLAND"],
    ["long-island", "LONG_ISLAND"],
    ["long_island long_island", "LONG_ISLAND"],
    ["nyc_core", "NYC_CORE"],
    ["nyc core", "NYC_CORE"],
    ["northern_nj", "NORTHERN_NJ"],
    ["north_jersey", "NORTHERN_NJ"],
    ["north jersey", "NORTHERN_NJ"],
    ["westchester", "WESTCHESTER"],
    ["connecticut", "CONNECTICUT"],
    ["ct", "CONNECTICUT"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeMarketKey(input)).toBe(expected);
  });

  it("resolves Nassau and Suffolk settings areas to Long Island with high confidence", () => {
    expect(googlePlacesImport.resolveRequestedMarketForImport({ areas: "Nassau County NY, Suffolk County NY" })).toMatchObject({
      resolved: "LONG_ISLAND",
      source: "settings.areas",
      confidence: "high",
    });
  });

  it("resolves Garden City and Huntington settings areas to Long Island", () => {
    expect(googlePlacesImport.resolveRequestedMarketForImport({ areas: "Garden City NY, Huntington NY" }).resolved).toBe("LONG_ISLAND");
  });

  it("does not let malformed duplicate explicit Long Island token break area resolution", () => {
    expect(googlePlacesImport.resolveRequestedMarketForImport({ requested_market: "long_island long_island", areas: "Nassau County NY, Suffolk County NY, Garden City NY, Huntington NY" })).toMatchObject({
      resolved: "LONG_ISLAND",
      source: "settings.areas",
      confidence: "high",
    });
  });

  it.each([
    ["Bronx NY", "NYC_CORE"],
    ["Staten Island NY", "NYC_CORE"],
    ["Jersey City NJ", "NORTHERN_NJ"],
    ["Stamford CT", "CONNECTICUT"],
  ])("resolves %s to %s", (area, expected) => {
    expect(googlePlacesImport.resolveRequestedMarketForImport({ areas: area }).resolved).toBe(expected);
  });
});

describe("Google Places import skip accounting helpers", () => {
  it("sums duplicate and low quality counts without overwriting either group", () => {
    const skippedByReason = googlePlacesImport.mergeCountMaps({ duplicate: 1, low_quality: 1 }, { low_quality: 1 });
    const skipped = Object.values(skippedByReason).reduce((total, count) => total + count, 0);

    expect(skippedByReason).toEqual({ duplicate: 1, low_quality: 2 });
    expect(skippedByReason.duplicate).toBe(1);
    expect(skipped).toBe(3);
    expect(4).toBe(1 + skipped);
  });

  it("aliases market_mismatch_count to the final wrong_market skip count", () => {
    const stats = googlePlacesImport.normalizeImportSkipCounts({
      skipped: 4,
      skipped_duplicate: 1,
      skipped_wrong_state: 1,
      skipped_wrong_market: 1,
      skipped_by_reason: {
        duplicate: 1,
        low_quality: 1,
        wrong_state: 1,
        wrong_market: 1,
      },
      market_mismatch_count: 4,
    });

    expect(stats.market_mismatch_count).toBe(1);
    expect(stats.market_mismatch_count).toBe(stats.skipped_wrong_market);
    expect(stats.market_mismatch_count).not.toBe(stats.skipped_wrong_state + stats.skipped_wrong_market);
    expect(stats.skipped_by_reason.wrong_market).toBe(stats.skipped_wrong_market);
  });

  it("computes overall market mismatches from restaurant and activity wrong_market skips only", () => {
    const restaurant = googlePlacesImport.normalizeImportSkipCounts({
      skipped_wrong_market: 12,
      skipped_wrong_state: 2,
      skipped_duplicate: 71,
      market_mismatch_count: 14,
    });
    const activity = googlePlacesImport.normalizeImportSkipCounts({
      skipped_wrong_market: 6,
      skipped_wrong_state: 0,
      skipped_duplicate: 0,
      market_mismatch_count: 7,
    });
    const overallMarketMismatchCount = restaurant.skipped_wrong_market + activity.skipped_wrong_market;

    expect(restaurant.market_mismatch_count).toBe(restaurant.skipped_wrong_market);
    expect(activity.market_mismatch_count).toBe(activity.skipped_wrong_market);
    expect(overallMarketMismatchCount).toBe(18);
    expect(overallMarketMismatchCount).toBe(restaurant.skipped_wrong_market + activity.skipped_wrong_market);
  });
});
