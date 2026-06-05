import { describe, expect, it } from "vitest";
import { normalizeIntent } from "../normalize-intent";
import { hasExplicitGeo, resolveSearchMarket } from "../markets";
import type { GeoIntent } from "../types";

const emptyGeo: GeoIntent = { aliases: [], geoStrictness: "none" };

describe("enterprise search markets", () => {
  it("applies the default market when no explicit geo exists", () => {
    const intent = normalizeIntent("restaurant and rooftop drinks after walking distance");
    expect(hasExplicitGeo(intent.geo)).toBe(false);
    const result = resolveSearchMarket({ geo: intent.geo });
    expect(result.marketApplied).toBe(true);
    expect(result.market?.id).toBe("nyc_long_island");
    expect(result.market?.label).toBe("NYC + Long Island");
    expect(result.effectiveGeo.geoStrictness).toBe("default_market");
    expect(result.effectiveGeo.latitude).toBe(40.758);
    expect(result.effectiveGeo.longitude).toBe(-73.9855);
    expect(result.effectiveGeo.radiusMiles).toBe(45);
  });

  it("does not apply the default market for explicit Brooklyn", () => {
    const result = resolveSearchMarket({ geo: { ...emptyGeo, raw: "Brooklyn", borough: "Brooklyn", city: "New York", state: "NY" } });
    expect(result.marketApplied).toBe(false);
    expect(result.marketReason).toBe("explicit_geo");
  });

  it("does not apply the default market for explicit Long Island", () => {
    const result = resolveSearchMarket({ geo: { ...emptyGeo, raw: "Long Island", region: "Long Island", state: "NY" } });
    expect(result.marketApplied).toBe(false);
  });

  it("does not apply the default market for explicit Hoboken", () => {
    const result = resolveSearchMarket({ geo: { ...emptyGeo, raw: "Hoboken", city: "Hoboken", state: "NJ" } });
    expect(result.marketApplied).toBe(false);
  });
});
