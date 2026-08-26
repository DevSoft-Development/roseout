import { describe, expect, it } from "vitest";
import { adaptV2ResponseToCurrentPublicContract } from "../response/compatibilityAdapter";
import { passesDateNightRestaurantQualityFloor } from "../scoring/dateSuitability";

describe("rooftop preference and date-night quality regressions", () => {
  it("keeps rooftop as an activity feature instead of a hard activity term", () => {
    const adapted = adaptV2ResponseToCurrentPublicContract({
      restaurants: [],
      activities: [],
      pairs: [],
      sameVenueResults: [],
      searchPlan: {
        pairing: { required: true },
        restaurant: { required: true, cuisines: [], foods: [], features: ["rooftop"] },
        activity: { required: true, categories: [], features: ["rooftop"] },
      },
      requestFulfilled: true,
      partialResults: false,
      outcome: "success",
      displayMode: "mixed_results",
      anchor: { requested: false, resolved: false, relationship: null, rawName: null, location: null },
      fallback: { used: false, reason: null },
      retrieval: { legacyFallbackUsed: false, fallbackDomains: [], servedSource: "canonical_profile", profileCandidateCount: 0 },
      geoResolution: null,
      debug: {},
      builder: { enabled: false, restaurants: [], activities: [] },
      counts: {
        builderRestaurantCards: 0,
        builderActivityCards: 0,
        uniquePairRestaurants: 0,
        uniquePairActivities: 0,
      },
      requestId: "rooftop-feature-regression",
      resolvedMode: "paired_outing",
      primaryDomain: "mixed",
      primary_domain: "mixed",
      success: true,
      message: "ok",
      timing: {},
      ml: {},
    } as any);

    expect(adapted.normalizedIntent.activityTerms).toEqual([]);
    expect(adapted.normalizedIntent.activityFeatures).toEqual(["rooftop"]);
    expect(adapted.normalizedIntent.restaurantTerms).toContain("rooftop");
  });

  it("does not let generic wine/cocktail enrichment rescue a bare pizzeria for date night", () => {
    expect(
      passesDateNightRestaurantQualityFloor(
        "Joe's Pizza pizzeria pizza restaurant wine lounge drinks cocktails beer brunch",
      ),
    ).toBe(false);
  });

  it("still allows a pizzeria with real full-service/date-night evidence", () => {
    expect(
      passesDateNightRestaurantQualityFloor(
        "Luna Pizzeria pizza full-service table service reservations intimate dining wine list",
      ),
    ).toBe(true);
  });
});
