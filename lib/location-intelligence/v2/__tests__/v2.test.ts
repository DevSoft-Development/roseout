import { describe, expect, it } from "vitest";
import { coveragePriority } from "@/lib/location-intelligence/v2/coverage";
import { reviewRefreshCadenceDays } from "@/lib/location-intelligence/v2/policy";
import { computeSearchV3Readiness } from "@/lib/location-intelligence/v2/readiness";
import { providersForCapability } from "@/lib/location-intelligence/v2/providers";

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

  it("keeps Google first for identity and DataForSEO for reviews", () => {
    expect(providersForCapability("identity")[0]?.id).toBe("google");
    expect(providersForCapability("reviews")[0]?.id).toBe("dataforseo");
  });
});
