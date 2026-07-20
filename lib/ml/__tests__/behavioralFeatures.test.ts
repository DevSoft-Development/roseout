import { describe, expect, it } from "vitest";
import { calculateBehavioralAdjustments, calculateLocationBehaviorFeature, calculateResultQualityFeature, confidenceFromSample, positionNormalizedCtr, stablePairKey } from "@/lib/ml/behavioralFeatures";

describe("Phase 2 behavioral features", () => {
  it("keeps no-data result quality neutral and missing", () => {
    const feature = calculateResultQualityFeature({});
    expect(feature.resultQualityScore).toBe(50);
    expect(feature.confidence).toBe(0);
    expect(feature.dataStatus).toBe("missing");
  });

  it("uses seen impressions, positive conversions, and negative feedback", () => {
    const positive = calculateResultQualityFeature({ seenImpressionCount: 100, clickCount: 30, saveCount: 15, reservationCompleteCount: 8, outingCompleteCount: 6, callCount: 4, websiteClickCount: 4, averagePosition: 3 });
    const negative = calculateResultQualityFeature({ seenImpressionCount: 100, clickCount: 30, negativeFeedbackCount: 25, immediateResearchCount: 20, bounceCount: 20, averagePosition: 3 });
    expect(positive.resultQualityScore).toBeGreaterThan(50);
    expect(negative.resultQualityScore).toBeLessThan(positive.resultQualityScore);
  });

  it("position-normalizes identical engagement so lower slots are not unfairly penalized", () => {
    const top = positionNormalizedCtr(10, 100, null, 1);
    const lower = positionNormalizedCtr(10, 100, null, 6);
    expect(lower).toBeGreaterThan(top);
  });

  it("keeps tiny high-rate samples low confidence and close to neutral", () => {
    const feature = calculateResultQualityFeature({ seenImpressionCount: 2, clickCount: 2, saveCount: 1 });
    expect(feature.confidence).toBeLessThan(0.3);
    expect(feature.dataStatus).toBe("low_sample");
    expect(feature.resultQualityScore).toBeLessThan(70);
  });

  it("creates deterministic stable pair keys", () => {
    expect(stablePairKey("REST-1", "ACT-2")).toBe("rest-1:act-2");
    expect(stablePairKey(" rest-1 ", " act-2 ")).toBe("rest-1:act-2");
  });

  it("separates behavior components for location scores", () => {
    const feature = calculateLocationBehaviorFeature("loc-1", { seenImpressionCount: 100, clickCount: 20, outingCompleteCount: 10, negativeFeedbackCount: 2 });
    expect(feature.completionScore).toBeGreaterThan(0);
    expect(feature.negativeSignalPenalty).toBeGreaterThan(0);
    expect(feature.dataStatus).toBe("ready");
  });

  it("caps applied ranking boosts and leaves personalization shadow-only", () => {
    const adjustment = calculateBehavioralAdjustments({ locationBehaviorScore: 100, resultQualityScore: 100, pairCompatibilityScore: 100, marketFitScore: 100, timeFitScore: 100, personalizationShadowScore: 100, confidence: 1 });
    expect(adjustment.totalAppliedBoost).toBe(20);
    expect(adjustment.personalizationShadowBoost).toBeGreaterThan(0);
    expect(adjustment.totalAppliedBoost).not.toBeGreaterThan(20);
  });

  it("allows disabled feature families to contribute zero", () => {
    const adjustment = calculateBehavioralAdjustments({ resultQualityScore: 100, confidence: 1, disabledFeatureFamilies: ["result_quality"] });
    expect(adjustment.resultQualityBoost).toBe(0);
    expect(adjustment.skippedFeatures).toContain("result_quality:disabled");
  });

  it("calculates logarithmic confidence", () => {
    expect(confidenceFromSample(0, 100)).toBe(0);
    expect(confidenceFromSample(100, 100)).toBe(1);
  });
});
