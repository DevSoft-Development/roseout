export const BEHAVIORAL_FEATURE_VERSION = "behavioral_phase2_v1";
export const RANKING_VERSION = "behavioral_rank_v1";

export type ResultType = "restaurant" | "activity" | "pair" | "same_location";
export type FeatureStatus = "ready" | "low_sample" | "missing" | "stale" | "failed";

export type SearchBehaviorEvent = {
  id: string;
  eventType: string;
  searchEventId: string;
  resultImpressionId?: string | null;
  userId?: string | null;
  anonymousId?: string | null;
  sessionId: string;
  queryFingerprint: string;
  intentBucket: string;
  marketKey?: string | null;
  locationId?: string | null;
  restaurantLocationId?: string | null;
  activityLocationId?: string | null;
  pairKey?: string | null;
  resultType: ResultType;
  renderedPosition?: number | null;
  seenPosition?: number | null;
  page?: number | null;
  lane?: string | null;
  baseScore?: number | null;
  behavioralBoost?: number | null;
  finalScore?: number | null;
  rankingVersion: string;
  featureVersion: string;
  experimentId?: string | null;
  occurredAt: string;
};

export type ResultFeatureInput = {
  seenImpressionCount?: number;
  clickCount?: number;
  saveCount?: number;
  reservationCompleteCount?: number;
  outingCompleteCount?: number;
  callCount?: number;
  websiteClickCount?: number;
  negativeFeedbackCount?: number;
  immediateResearchCount?: number;
  bounceCount?: number;
  expectedCtr?: number | null;
  averagePosition?: number | null;
};

export type LocationBehaviorFeature = {
  locationId: string;
  engagementScore: number;
  conversionScore: number;
  completionScore: number;
  negativeSignalPenalty: number;
  finalBehaviorScore: number;
  sampleSize: number;
  confidence: number;
  dataStatus: FeatureStatus;
  calculatedAt: string;
  featureVersion: string;
};

export type BehavioralAdjustments = {
  locationBehaviorBoost: number;
  resultQualityBoost: number;
  pairCompatibilityBoost: number;
  marketFitBoost: number;
  timeFitBoost: number;
  personalizationShadowBoost: number;
  totalAppliedBoost: number;
  activeFeatures: string[];
  skippedFeatures: string[];
  confidence: number;
  explanations: string[];
};

export function clamp(value: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function stablePairKey(restaurantCanonicalId: unknown, activityCanonicalId: unknown): string {
  return `${String(restaurantCanonicalId ?? "").trim().toLowerCase()}:${String(activityCanonicalId ?? "").trim().toLowerCase()}`;
}

export function confidenceFromSample(sampleSize: number, targetSampleSize: number): number {
  return Number(clamp(Math.log1p(Math.max(0, sampleSize)) / Math.log1p(Math.max(1, targetSampleSize)), 0, 1).toFixed(4));
}

export function confidenceStatus(sampleSize: number, stale = false, failed = false): FeatureStatus {
  if (failed) return "failed";
  if (stale) return "stale";
  if (sampleSize <= 0) return "missing";
  if (sampleSize < 25) return "low_sample";
  return "ready";
}

export function positionWeight(position: number | null | undefined): number {
  const p = Math.max(1, Math.floor(Number(position) || 1));
  return 1 / Math.log2(p + 1);
}

export function positionNormalizedCtr(clicks: number, seenImpressions: number, expectedCtr?: number | null, averagePosition?: number | null): number {
  if (seenImpressions <= 0) return 1;
  const actual = clamp(clicks / seenImpressions, 0, 1);
  if (expectedCtr && expectedCtr > 0) return clamp(actual / expectedCtr, 0, 3);
  const discountedExpected = Math.max(0.01, 0.24 * positionWeight(averagePosition ?? 1));
  return clamp(actual / discountedExpected, 0, 3);
}

export function calculateResultQualityFeature(input: ResultFeatureInput) {
  const seen = Math.max(0, Number(input.seenImpressionCount ?? 0));
  const clicks = Math.max(0, Number(input.clickCount ?? 0));
  const saves = Math.max(0, Number(input.saveCount ?? 0));
  const reservationCompletes = Math.max(0, Number(input.reservationCompleteCount ?? 0));
  const outingCompletes = Math.max(0, Number(input.outingCompleteCount ?? 0));
  const secondaryConversions = Math.max(0, Number(input.callCount ?? 0) + Number(input.websiteClickCount ?? 0));
  const negatives = Math.max(0, Number(input.negativeFeedbackCount ?? 0));
  const immediateResearch = Math.max(0, Number(input.immediateResearchCount ?? 0));
  const bounces = Math.max(0, Number(input.bounceCount ?? 0));
  if (seen <= 0) return { resultQualityScore: 50, confidence: 0, sampleSize: 0, dataStatus: "missing" as FeatureStatus, rates: { seenCtr: 0, relativeCtr: 1, saveRate: 0, conversionRate: 0, completionRate: 0, negativeFeedbackRate: 0, immediateResearchRate: 0, bounceRate: 0 } };
  const relativeCtr = positionNormalizedCtr(clicks, seen, input.expectedCtr, input.averagePosition);
  const seenCtr = clamp(clicks / seen, 0, 1);
  const saveRate = clamp(saves / seen, 0, 1);
  const reservationCompletionRate = clamp(reservationCompletes / seen, 0, 1);
  const outingCompletionRate = clamp(outingCompletes / seen, 0, 1);
  const secondaryConversionRate = clamp(secondaryConversions / seen, 0, 1);
  const negativeFeedbackRate = clamp(negatives / seen, 0, 1);
  const immediateResearchRate = clamp(immediateResearch / seen, 0, 1);
  const bounceRate = clamp(bounces / seen, 0, 1);
  const positive = relativeCtr * 20 + saveRate * 25 + reservationCompletionRate * 25 + outingCompletionRate * 35 + secondaryConversionRate * 10;
  const negative = negativeFeedbackRate * 35 + immediateResearchRate * 20 + bounceRate * 10;
  const confidence = confidenceFromSample(seen, 100);
  const rawScore = 50 + positive - negative;
  const dampedScore = 50 + (rawScore - 50) * confidence;
  return { resultQualityScore: Number(clamp(dampedScore, 0, 100).toFixed(2)), confidence, sampleSize: seen, dataStatus: confidenceStatus(seen), rates: { seenCtr, relativeCtr, saveRate, conversionRate: clamp((reservationCompletes + secondaryConversions) / seen, 0, 1), completionRate: outingCompletionRate, negativeFeedbackRate, immediateResearchRate, bounceRate } };
}

export function calculateLocationBehaviorFeature(locationId: string, input: ResultFeatureInput & { calculatedAt?: string }): LocationBehaviorFeature {
  const quality = calculateResultQualityFeature(input);
  const engagementScore = clamp(quality.rates.relativeCtr * 20 + quality.rates.saveRate * 40, 0, 100);
  const conversionScore = clamp(quality.rates.conversionRate * 100, 0, 100);
  const completionScore = clamp(quality.rates.completionRate * 100, 0, 100);
  const negativeSignalPenalty = clamp(quality.rates.negativeFeedbackRate * 60 + quality.rates.immediateResearchRate * 40, 0, 100);
  const raw = engagementScore * 0.35 + conversionScore * 0.25 + completionScore * 0.3 - negativeSignalPenalty * 0.4;
  const finalBehaviorScore = Number(clamp(50 + (raw - 25) * quality.confidence, 0, 100).toFixed(2));
  return { locationId, engagementScore: Number(engagementScore.toFixed(2)), conversionScore: Number(conversionScore.toFixed(2)), completionScore: Number(completionScore.toFixed(2)), negativeSignalPenalty: Number(negativeSignalPenalty.toFixed(2)), finalBehaviorScore, sampleSize: quality.sampleSize, confidence: quality.confidence, dataStatus: quality.dataStatus, calculatedAt: input.calculatedAt ?? new Date().toISOString(), featureVersion: BEHAVIORAL_FEATURE_VERSION };
}

function boostFromScore(score: number, confidence: number, min: number, max: number): number {
  return Number(clamp(((score - 50) / 50) * max * confidence, min, max).toFixed(2));
}

export function calculateBehavioralAdjustments(input: {
  locationBehaviorScore?: number | null;
  resultQualityScore?: number | null;
  pairCompatibilityScore?: number | null;
  marketFitScore?: number | null;
  timeFitScore?: number | null;
  personalizationShadowScore?: number | null;
  confidence?: number | null;
  disabledFeatureFamilies?: string[];
}): BehavioralAdjustments {
  const disabled = new Set(input.disabledFeatureFamilies ?? []);
  const confidence = clamp(input.confidence ?? 0, 0, 1);
  const activeFeatures: string[] = [];
  const skippedFeatures: string[] = [];
  const explanations: string[] = [];
  const applyFeature = (name: string, score: number | null | undefined, min: number, max: number) => {
    if (disabled.has(name)) { skippedFeatures.push(`${name}:disabled`); return 0; }
    if (score == null || !Number.isFinite(Number(score))) { skippedFeatures.push(`${name}:missing`); return 0; }
    activeFeatures.push(name);
    const boost = boostFromScore(Number(score), confidence, min, max);
    explanations.push(`${name} score ${Number(score).toFixed(1)} applied ${boost}`);
    return boost;
  };
  const locationBehaviorBoost = applyFeature("location_behavior", input.locationBehaviorScore, -8, 10);
  const resultQualityBoost = applyFeature("result_quality", input.resultQualityScore, -8, 10);
  const pairCompatibilityBoost = applyFeature("pair_compatibility", input.pairCompatibilityScore, -10, 12);
  const marketFitBoost = applyFeature("market_fit", input.marketFitScore, -4, 5);
  const timeFitBoost = applyFeature("time_fit", input.timeFitScore, -6, 6);
  const personalizationShadowBoost = disabled.has("personalization") || input.personalizationShadowScore == null ? 0 : boostFromScore(Number(input.personalizationShadowScore), confidence, -5, 5);
  if (personalizationShadowBoost) explanations.push(`personalization shadow score logged ${personalizationShadowBoost}; not applied`);
  const totalAppliedBoost = Number(clamp(locationBehaviorBoost + resultQualityBoost + pairCompatibilityBoost + marketFitBoost + timeFitBoost, -20, 20).toFixed(2));
  return { locationBehaviorBoost, resultQualityBoost, pairCompatibilityBoost, marketFitBoost, timeFitBoost, personalizationShadowBoost, totalAppliedBoost, activeFeatures, skippedFeatures, confidence, explanations };
}
