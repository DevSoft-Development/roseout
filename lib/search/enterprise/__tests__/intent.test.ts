import { describe, expect, it } from "vitest";
import { normalizeIntent } from "../normalize-intent";
import { resolveSearchMarket } from "../markets";

describe("enterprise search intent", () => {
  it("parses rooftop drinks after steak dinner as a mixed outing", () => {
    const intent = normalizeIntent("steak dinner and rooftop drinks after");
    expect(intent.searchType).toBe("mixed_outing");
    expect(intent.needsRestaurant).toBe(true);
    expect(intent.needsActivity).toBe(true);
    expect(intent.wantsPairing).toBe(true);
    expect([...intent.restaurantIntent.foodTerms, ...intent.restaurantIntent.mealTerms]).toContain("steak");
    expect(intent.restaurantIntent.mealTerms).toContain("dinner");
    const activityTerms = [...intent.activityIntent.activityTerms, ...intent.activityIntent.categoryTerms, ...intent.activityIntent.featureTerms];
    for (const term of ["rooftop bar", "rooftop lounge", "rooftop drinks", "cocktails", "lounge", "bar"]) {
      expect(activityTerms).toContain(term);
    }
  });

  it("parses walking minutes", () => {
    const intent = normalizeIntent("steak dinner and rooftop drinks 30 minute walk apart");
    expect(intent.pairingPreference).toEqual({
      requiresPairing: true,
      distanceMode: "walking",
      maxPairDistanceMiles: 1.5,
      maxPairWalkingMinutes: 30,
      requireWalkablePair: true,
    });
  });

  it("parses strict walking and explicit Queens geo", () => {
    const intent = normalizeIntent("steak dinner and rooftop drinks 1 minute walk apart in Queens");
    expect(intent.pairingPreference?.distanceMode).toBe("walking");
    expect(intent.pairingPreference?.maxPairWalkingMinutes).toBe(1);
    expect(intent.pairingPreference?.maxPairDistanceMiles).toBe(0.1);
    expect(intent.pairingPreference?.requireWalkablePair).toBe(true);
    expect(intent.geo.borough).toBe("Queens");
    expect(resolveSearchMarket({ geo: intent.geo }).marketApplied).toBe(false);
  });
});
