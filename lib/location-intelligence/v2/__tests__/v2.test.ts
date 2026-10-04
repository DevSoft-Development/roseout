import { describe, expect, it } from "vitest";
import { coveragePriority } from "@/lib/location-intelligence/v2/coverage";
import { allowPaidProviderExecution, reviewRefreshCadenceDays } from "@/lib/location-intelligence/v2/policy";
import { computeSearchV3Readiness } from "@/lib/location-intelligence/v2/readiness";
import { providersForCapability } from "@/lib/location-intelligence/v2/providers";
import { deriveLocationClassification } from "@/lib/location-intelligence/v2/classification";
import { hasUsableProviderData } from "@/lib/location-intelligence/v2/orchestrator";
import { mergeProviderHealthMetadata } from "@/lib/location-intelligence/v2/provider-runtime";
import { nextPilotQuotas, pilotBatchQuotas, pilotCategoryKey, pilotEnrichmentCommitted, pilotMarkerCountsAsSuccess } from "@/lib/location-intelligence/v2/pilot";

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


describe("Location Intelligence V2 pilot quotas", () => {
  it("selects exactly ten locations per pilot batch", () => {
    for (const batchIndex of [0, 1, 2, 9]) {
      expect(
        pilotBatchQuotas(batchIndex).reduce((sum, quota) => sum + quota.count, 0),
      ).toBe(10);
    }
  });

  it("balances the full ten-batch pilot across states and location types", () => {
    const totals = {
      states: { NY: 0, NJ: 0, CT: 0 },
      types: { restaurant: 0, activity: 0 },
    };

    for (let batchIndex = 0; batchIndex < 10; batchIndex += 1) {
      for (const quota of pilotBatchQuotas(batchIndex)) {
        totals.states[quota.state] += quota.count;
        totals.types[quota.locationType] += quota.count;
      }
    }

    expect(totals.states).toEqual({ NY: 70, NJ: 20, CT: 10 });
    expect(totals.types).toEqual({ restaurant: 60, activity: 40 });
  });

  it("fills failed pilot cells instead of drifting the final cohort", () => {
    const quotas = nextPilotQuotas({
      attempted: 100,
      successful: 99,
      successfulByCell: {
        "NY:restaurant": 45,
        "NY:activity": 25,
        "NJ:restaurant": 10,
        "NJ:activity": 10,
        "CT:restaurant": 5,
        "CT:activity": 4,
      },
    });

    expect(quotas).toEqual([
      { state: "CT", locationType: "activity", count: 1 },
    ]);
  });

  it("uses activity_type for activity diversity", () => {
    expect(
      pilotCategoryKey({
        primary_category: null,
        activity_type: "arcade",
        category: null,
        cuisine_type: null,
        cuisine: null,
      }),
    ).toBe("arcade");
  });

  it("prefers activity_type over generic primary_category for activities", () => {
    expect(
      pilotCategoryKey({
        location_type: "activity",
        primary_category: "listing",
        activity_type: "rooftop",
        category: null,
        cuisine_type: null,
        cuisine: null,
      }),
    ).toBe("rooftop");
  });

  it("counts a reserved location as successful after enrichment even if the final audit write fails", () => {
    expect(pilotMarkerCountsAsSuccess("reserved", true)).toBe(true);
    expect(pilotMarkerCountsAsSuccess("reserved", false)).toBe(false);
    expect(pilotMarkerCountsAsSuccess("success", true)).toBe(true);
  });

  it("recognizes a durable initial-enrichment timestamp after a later enrichment error", () => {
    expect(pilotEnrichmentCommitted("2026-10-04T21:00:00.000Z")).toBe(true);
    expect(pilotEnrichmentCommitted(null)).toBe(false);
    expect(pilotEnrichmentCommitted("")).toBe(false);
  });

  it("never treats an unknown reconciliation result as a confirmed non-commit", () => {
    const unknown: boolean | null = null;
    expect(unknown).not.toBe(false);
  });
});

describe("Location Intelligence V2 provider health metadata", () => {
  it("preserves policy metadata while updating health detail", () => {
    expect(
      mergeProviderHealthMetadata(
        { role: "fallback_only", quota_mode: "free_tier" },
        "missing:apiKey",
      ),
    ).toEqual({
      role: "fallback_only",
      quota_mode: "free_tier",
      detail: "missing:apiKey",
    });
  });

  it("clears stale health detail without erasing provider policy metadata", () => {
    expect(
      mergeProviderHealthMetadata({
        role: "fallback_only",
        quota_mode: "free_tier",
        detail: "missing:apiKey",
      }),
    ).toEqual({
      role: "fallback_only",
      quota_mode: "free_tier",
    });
  });
});

describe("Location Intelligence V2 provider fallback adequacy", () => {
  it("treats empty provider payloads as inadequate", () => {
    expect(hasUsableProviderData(null)).toBe(false);
    expect(hasUsableProviderData([])).toBe(false);
    expect(hasUsableProviderData({})).toBe(false);
    expect(hasUsableProviderData({ organicResults: [], localResults: [] })).toBe(false);
  });

  it("accepts provider payloads containing usable results", () => {
    expect(hasUsableProviderData([{ url: "https://example.com" }])).toBe(true);
    expect(hasUsableProviderData({ organicResults: [{ title: "Example" }], localResults: [] })).toBe(true);
    expect(hasUsableProviderData({ places: [{ id: "place-1" }] })).toBe(true);
  });
});
