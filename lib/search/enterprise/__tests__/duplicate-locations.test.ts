import { describe, expect, it } from "vitest";
import { detectDuplicateSearchLocations } from "@/lib/search/duplicateLocations";

const loc = (overrides: Record<string, unknown>) => ({
  id: "base",
  name: "Base Place",
  address: "1 Main St",
  city: "New York",
  state: "NY",
  zip_code: "10001",
  ...overrides,
});

const hasError = (messages: string[], code: string) => messages.some((message) => message.includes(code));
const hasKey = (keys: string[], key: string) => keys.includes(key);

describe("duplicate search location diagnostics", () => {
  it("returns clean diagnostics when no duplicate is shown", () => {
    const result = detectDuplicateSearchLocations({
      restaurants: [{ id: "r1", name: "Cafe A", address: "1 Main St" }],
      activities: [{ id: "a1", name: "Bowling A", address: "2 Main St" }],
      pairs: [],
    });

    expect(result.duplicateLocationShown).toBe(false);
    expect(result.duplicateLocationCount).toBe(0);
    expect(result.duplicateLocationErrors).toEqual([]);
    expect(result.duplicateLocationWarnings).toEqual([]);
    expect(result.duplicateLocationKeys).toEqual([]);
  });

  it("flags the same id twice in restaurants", () => {
    const result = detectDuplicateSearchLocations({ restaurants: [loc({ id: "r1" }), loc({ id: "r1" })] });
    expect(result.duplicateLocationShown).toBe(true);
    expect(hasError(result.duplicateLocationErrors, "duplicate_location_id")).toBe(true);
    expect(hasKey(result.duplicateLocationKeys, "id:r1")).toBe(true);
  });

  it("flags the same id twice in activities", () => {
    const result = detectDuplicateSearchLocations({ activities: [loc({ id: "a1" }), loc({ id: "a1" })] });
    expect(result.duplicateLocationShown).toBe(true);
    expect(hasError(result.duplicateLocationErrors, "duplicate_location_id")).toBe(true);
    expect(hasKey(result.duplicateLocationKeys, "id:a1")).toBe(true);
  });

  it("flags the same google_place_id twice", () => {
    const result = detectDuplicateSearchLocations({ restaurants: [loc({ id: "r1", google_place_id: "place1" }), loc({ id: "r2", google_place_id: "place1" })] });
    expect(result.duplicateLocationShown).toBe(true);
    expect(hasError(result.duplicateLocationErrors, "duplicate_google_place_id")).toBe(true);
    expect(hasKey(result.duplicateLocationKeys, "google_place_id:place1")).toBe(true);
  });

  it("flags an exact pair repeated", () => {
    const restaurant = loc({ id: "r1" });
    const activity = loc({ id: "a1", name: "Bowling A", address: "2 Main St" });
    const result = detectDuplicateSearchLocations({ pairs: [{ restaurant, activity }, { restaurant, activity }] });
    expect(result.duplicateLocationShown).toBe(true);
    expect(hasError(result.duplicateLocationErrors, "duplicate_exact_pair")).toBe(true);
  });

  it("flags the same location on both sides of a pair", () => {
    const same = loc({ id: "same", name: "Same Place", address: "1 Main St" });
    const result = detectDuplicateSearchLocations({ pairs: [{ restaurant: same, activity: { ...same } }] });
    expect(result.duplicateLocationShown).toBe(true);
    expect(hasError(result.duplicateLocationErrors, "same_location_pair_without_combo_mode")).toBe(true);
  });

  it("flags the same location on both sides of an alternate pair shape", () => {
    const result = detectDuplicateSearchLocations({
      pairs: [
        {
          restaurant_location: { id: "same", name: "Same Place", address: "1 Main St" },
          activity_location: { id: "same", name: "Same Place", address: "1 Main St" },
        },
      ],
    });
    expect(result.duplicateLocationShown).toBe(true);
    expect(hasError(result.duplicateLocationErrors, "same_location_pair_without_combo_mode")).toBe(true);
  });

  it("warns for same normalized name and address with different ids", () => {
    const result = detectDuplicateSearchLocations({ restaurants: [loc({ id: "1", name: "Joe's Pizza", address: "1435 Broadway" }), loc({ id: "2", name: "Joes Pizza", address: "1435 Broadway." })] });
    expect(result.duplicateLocationShown).toBe(true);
    expect(result.duplicateLocationWarnings.some((message) => message.includes("Possible duplicate physical location shown"))).toBe(true);
  });

  it("allows the same brand name with different addresses", () => {
    const result = detectDuplicateSearchLocations({
      restaurants: [
        { id: "1", name: "Joe's Pizza", address: "1435 Broadway" },
        { id: "2", name: "Joe's Pizza", address: "216 Bedford Ave" },
      ],
    });
    expect(result.duplicateLocationShown).toBe(false);
    expect(result.duplicateLocationErrors).toEqual([]);
    expect(result.duplicateLocationWarnings).toEqual([]);
  });

  it("flags duplicate cards", () => {
    const result = detectDuplicateSearchLocations({
      cards: [
        { id: "card1", name: "Cafe A", address: "1 Main St" },
        { id: "card1", name: "Cafe A", address: "1 Main St" },
      ],
    });
    expect(result.duplicateLocationShown).toBe(true);
    expect(hasError(result.duplicateLocationErrors, "duplicate_location_id")).toBe(true);
    expect(hasKey(result.duplicateLocationKeys, "id:card1")).toBe(true);
  });
});
