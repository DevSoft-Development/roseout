import { describe, expect, it } from "vitest";
import { isAllowedLongIslandNearbyResult } from "../longIslandGeography";

const geo = { latitude: 40.7268, longitude: -73.6343, radiusMiles: 5, city: "Garden City", county: "Nassau", state: "NY", market: "Long Island" };
const result = (city: string, latitude: number, county = "Nassau", market = "Long Island") => ({ id: city, city, latitude, longitude: -73.64, county, market, state: "NY", is_searchable: true } as any);

describe("Garden City coordinate geography", () => {
  it("accepts exact and nearby Nassau towns without rewriting their city", () => {
    const mineola = result("Mineola", 40.74);
    expect(isAllowedLongIslandNearbyResult(result("Garden City", 40.727), geo)).toBe(true);
    expect(isAllowedLongIslandNearbyResult(mineola, geo)).toBe(true);
    expect(mineola.city).toBe("Mineola");
  });
  it("rejects out-of-radius, Queens, and Suffolk rows", () => {
    expect(isAllowedLongIslandNearbyResult(result("Westbury", 40.9), geo)).toBe(false);
    expect(isAllowedLongIslandNearbyResult(result("Queens", 40.73, "Queens", "NYC"), geo)).toBe(false);
    expect(isAllowedLongIslandNearbyResult(result("Huntington", 40.73, "Suffolk"), geo)).toBe(false);
  });
});
