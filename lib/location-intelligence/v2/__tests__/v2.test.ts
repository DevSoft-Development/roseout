import { describe, expect, it } from "vitest";
import { coveragePriority } from "@/lib/location-intelligence/v2/coverage";
import { allowPaidProviderExecution, reviewRefreshCadenceDays } from "@/lib/location-intelligence/v2/policy";
import { computeSearchV3Readiness } from "@/lib/location-intelligence/v2/readiness";
import { providersForCapability } from "@/lib/location-intelligence/v2/providers";
import { deriveLocationClassification } from "@/lib/location-intelligence/v2/classification";

describe("Location Intelligence V2", () => {
  it("prioritizes under-covered heat zones over saturated ones", () => {
    expect(coveragePriority({ area: "A", category: "karaoke", current: 1, target: 5 }))
      .toBeGreaterThan(coveragePriority({ area: "A", category: "italian", current: 8, target: 5 }));
  });

  it("uses demand-sensitive incremental review cadence", () => {
    expect(reviewRefreshCadenceDays(95)).toBe(30);
    expect(reviewRefreshCadenceDays(75)).toBe(60);
    expect(reviewRefreshCadenceDays(45)).toBe(90);
    expect(reviewRefreshCadenceDays(15)).toBe(180);
    expect(reviewRefreshCadenceDays(0)).toBeNull();
  });

  it("requires hard search-readiness gates", () => {
    const ready = computeSearchV3Readiness({
      hasIdentity: true,
      hasPlaceType: true,
      hasGeography: true,
      hasOperationalStatus: true,
      hasClassification: true,
      hasHours: true,
      hasFeatures: true,
      hasReviewIntelligence: true,
      negativeClassificationKnown: true,
    });
    expect(ready.searchV3Ready).toBe(true);

    const missingType = computeSearchV3Readiness({
      hasIdentity: true,
      hasPlaceType: false,
      hasGeography: true,
      hasOperationalStatus: true,
      hasClassification: true,
      hasHours: true,
      hasFeatures: true,
      hasReviewIntelligence: true,
      negativeClassificationKnown: true,
    });
    expect(missingType.searchV3Ready).toBe(false);
  });

  it("captures bakery-only negative intelligence", () => {
    const classification = deriveLocationClassification({
      location_type: "restaurant",
      primary_category: "Bakery",
      google_types: ["bakery", "food", "point_of_interest"],
      tags: ["pastries", "dessert"],
      is_searchable: true,
      has_photos: true,
      photo_status: "cached",
    });
    expect(classification.negativeFlags).toContain("bakery_only");
    expect(classification.negativeClassificationKnown).toBe(true);
  });

  it("blocks routine paid enrichment and protects owner-maintained profiles", () => {
    expect(allowPaidProviderExecution({ purpose: "routine_profile_refresh" })).toBe(false);
    expect(allowPaidProviderExecution({ purpose: "bootstrap", ownerMaintained: true })).toBe(false);
    expect(allowPaidProviderExecution({ purpose: "review_refresh", ownerMaintained: true })).toBe(true);
    expect(allowPaidProviderExecution({ purpose: "material_change", ownerMaintained: true })).toBe(true);
    expect(allowPaidProviderExecution({ purpose: "bootstrap", ownerMaintained: false })).toBe(true);
  });

  it("keeps Google first for identity and DataForSEO for reviews", () => {
    expect(providersForCapability("identity")[0]?.id).toBe("google");
    expect(providersForCapability("reviews")[0]?.id).toBe("dataforseo");
  });

  it("keeps SerpAPI behind Brave as a fallback web provider", () => {
    const webProviders = providersForCapability("web_context").map((provider) => provider.id);
    expect(webProviders.indexOf("brave")).toBeGreaterThanOrEqual(0);
    expect(webProviders.indexOf("serpapi")).toBeGreaterThan(webProviders.indexOf("brave"));
  });
});
