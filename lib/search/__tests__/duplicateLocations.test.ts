import { describe, expect, it } from "vitest";
import { dedupeFinalSearchResults, detectDuplicateSearchLocations } from "@/lib/search/duplicateLocations";

const loc = (overrides: Record<string, unknown>) => ({
  id: "base",
  name: "Base Place",
  address: "1 Main St",
  city: "New York",
  state: "NY",
  zip_code: "10001",
  ...overrides,
});
const pair = (restaurant: any, activity: any) => ({ restaurant, activity, title: "Pair" }) as any;

describe("duplicate search location health", () => {
  it("flags the same restaurant id twice as an error", () => {
    const result = detectDuplicateSearchLocations({ restaurants: [loc({ id: "r1" }), loc({ id: "r1" })] });
    expect(result.duplicateLocationShown).toBe(true);
    expect(result.duplicateLocationErrors.some((m) => m.includes("duplicate_location_id"))).toBe(true);
  });

  it("flags the same activity id twice as an error", () => {
    const result = detectDuplicateSearchLocations({ activities: [loc({ id: "a1" }), loc({ id: "a1" })] });
    expect(result.duplicateLocationErrors.some((m) => m.includes("duplicate_location_id"))).toBe(true);
  });

  it("flags the same google_place_id twice as an error", () => {
    const result = detectDuplicateSearchLocations({ restaurants: [loc({ id: "r1", google_place_id: "g1" }), loc({ id: "r2", google_place_id: "g1" })] });
    expect(result.duplicateLocationErrors.some((m) => m.includes("duplicate_google_place_id"))).toBe(true);
  });

  it("flags a repeated exact pair as an error", () => {
    const r = loc({ id: "r1" });
    const a = loc({ id: "a1", name: "Arcade", address: "2 Main St" });
    const result = detectDuplicateSearchLocations({ pairs: [pair(r, a), pair(r, a)] });
    expect(result.duplicateLocationErrors.some((m) => m.includes("duplicate_exact_pair"))).toBe(true);
  });

  it("flags same location on both sides of a pair without combo mode", () => {
    const r = loc({ id: "same" });
    const result = detectDuplicateSearchLocations({ pairs: [pair(r, { ...r })], allowSameLocationCombos: false });
    expect(result.duplicateLocationErrors.some((m) => m.includes("same_location_pair_without_combo_mode"))).toBe(true);
  });

  it("warns for same normalized name and address with different ids", () => {
    const result = detectDuplicateSearchLocations({ restaurants: [loc({ id: "r1", name: "Joe's Pizza", address: "1435 Broadway" }), loc({ id: "r2", name: "Joes Pizza", address: "1435 Broadway." })] });
    expect(result.duplicateLocationWarnings.some((m) => m.includes("Possible duplicate physical location"))).toBe(true);
  });

  it("does not flag same brand name at different addresses", () => {
    const result = detectDuplicateSearchLocations({ restaurants: [loc({ id: "r1", name: "Joe's Pizza", address: "1435 Broadway" }), loc({ id: "r2", name: "Joe's Pizza", address: "7 Carmine St" })] });
    expect(result.duplicateLocationShown).toBe(false);
  });

  it("final dedupe keeps the first-ranked duplicate id", () => {
    const first = loc({ id: "r1", name: "First Ranked" });
    const second = loc({ id: "r1", name: "Second Ranked" });
    const result = dedupeFinalSearchResults({ restaurants: [first as any, second as any] });
    expect(result.restaurants).toHaveLength(1);
    expect(result.restaurants[0]?.name).toBe("First Ranked");
  });

  it("final dedupe does not collapse valid different branch locations", () => {
    const result = dedupeFinalSearchResults({ restaurants: [loc({ id: "r1", name: "Joe's Pizza", address: "1435 Broadway" }) as any, loc({ id: "r2", name: "Joe's Pizza", address: "7 Carmine St" }) as any] });
    expect(result.restaurants).toHaveLength(2);
    expect(result.duplicateDiagnostics.duplicateLocationShown).toBe(false);
  });
});
