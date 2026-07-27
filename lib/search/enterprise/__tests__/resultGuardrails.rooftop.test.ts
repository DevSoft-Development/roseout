import { describe, expect, it } from "vitest";
import { applyResultGuardrails, hasStrongRooftopEvidence } from "../resultGuardrails";

function result(restaurants: any[]) {
  return {
    success: true,
    reply: "ok",
    restaurants,
    activities: [],
    pairs: [],
    fallbackPairs: [],
    recommendedFallbackPairs: [],
    card_counts: { restaurants: restaurants.length, activities: 0, pairs: 0, matched_locations: restaurants.length },
    cardCounts: { restaurants: restaurants.length, activities: 0, pairs: 0, matched_locations: restaurants.length },
    debug: {},
  } as any;
}

describe("rooftop result guardrail", () => {
  it("does not treat generic bar metadata as rooftop evidence", () => {
    const genericBar = {
      id: "generic",
      location_type: "restaurant",
      name: "Empire Steak House",
      restaurant_name: "Empire Steak House",
      search_keywords: ["steakhouse", "bar", "restaurant"],
      search_document: "steakhouse bar restaurant",
    };

    expect(hasStrongRooftopEvidence(genericBar as any)).toBe(false);
    const guarded = applyResultGuardrails(
      result([genericBar]),
      "Steak dinner and rooftop drinks in Manhattan",
    );

    expect(guarded.restaurants).toHaveLength(0);
    expect(guarded.card_counts.restaurants).toBe(0);
    expect(guarded.debug.rooftopEvidenceRemovedCount).toBe(1);
  });

  it("keeps restaurants with explicit rooftop evidence", () => {
    const rooftop = {
      id: "rooftop",
      location_type: "restaurant",
      name: "Skyline Steakhouse",
      restaurant_name: "Skyline Steakhouse",
      tags: ["steakhouse", "rooftop dining"],
      search_document: "steakhouse rooftop dining skyline views",
    };

    expect(hasStrongRooftopEvidence(rooftop as any)).toBe(true);
    const guarded = applyResultGuardrails(
      result([rooftop]),
      "Steak dinner and rooftop drinks in Manhattan",
    );

    expect(guarded.restaurants).toHaveLength(1);
    expect(guarded.debug.rooftopEvidenceRemovedCount).toBe(0);
  });
});
