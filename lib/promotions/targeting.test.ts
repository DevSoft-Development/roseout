import { describe, expect, it } from "vitest";
import { normalizePromotionTargeting, promotionGeoMatches } from "./targeting";

describe("promotion geographic targeting", () => {
  it("matches market aliases and ZIP targets", () => {
    const target = normalizePromotionTargeting({
      markets: ["Long Island"],
      zipCodes: ["11530", "11550"],
    });
    expect(promotionGeoMatches(target, { market: "LONG_ISLAND", zipCode: "11530" })).toBe(true);
    expect(promotionGeoMatches(target, { market: "NYC_CORE", zipCode: "10001" })).toBe(false);
  });

  it("lets exclusions override broad includes", () => {
    const target = normalizePromotionTargeting({
      markets: ["Long Island"],
      excludeZipCodes: ["11530"],
    });
    expect(promotionGeoMatches(target, { market: "LONG_ISLAND", zipCode: "11530" })).toBe(false);
    expect(promotionGeoMatches(target, { market: "LONG_ISLAND", zipCode: "11550" })).toBe(true);
  });

  it("supports radius targeting", () => {
    const target = normalizePromotionTargeting(
      { radiusMiles: 5 },
      { latitude: 40.7268, longitude: -73.6343 },
    );
    expect(promotionGeoMatches(target, { latitude: 40.7268, longitude: -73.6343 })).toBe(true);
    expect(promotionGeoMatches(target, { latitude: 40.80, longitude: -73.90 })).toBe(false);
  });
});
