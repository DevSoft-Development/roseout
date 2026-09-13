import type { SupabaseClient } from "@supabase/supabase-js";
import { geoTierRank } from "../geo/geoPolicy";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { ScoredCandidate } from "./scoringTypes";
import { detectBookingIntent, detectDistanceIntent, detectQualityIntent } from "./rankingIntent";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function locationOf(item: ScoredCandidate) {
  return item.candidate.candidate.location as Record<string, any>;
}

function idOf(item: ScoredCandidate) {
  return String(locationOf(item)?.id ?? "");
}

function confidence01(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return clamp(n > 1 ? n / 100 : n, 0, 1);
}

function centeredScore(value: unknown, maxMagnitude: number, confidence = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return clamp(((n - 50) / 50) * maxMagnitude * confidence, -maxMagnitude, maxMagnitude);
}

function normalizedTerms(values: unknown[]) {
  return new Set(values.flatMap((value) => Array.isArray(value) ? value : value == null ? [] : [value])
    .map(String)
    .map((value) => value.toLowerCase().replace(/[_-]+/g, " ").trim())
    .filter(Boolean));
}

function tagFit(plan: SearchPlan, features: any) {
  const requested = normalizedTerms([
    plan.occasion,
    plan.preferences?.vibes,
    plan.preferences?.subjectiveTerms,
    plan.restaurant.features,
    plan.activity.features,
  ]);
  if (!requested.size) return 0;
  const learned = normalizedTerms([
    features?.ml_vibes,
    features?.ml_features,
    features?.ml_occasions,
    features?.ml_audiences,
  ]);
  if (!learned.size) return 0;
  let matches = 0;
  for (const term of requested) {
    for (const candidate of learned) {
      if (term === candidate || term.includes(candidate) || candidate.includes(term)) {
        matches += 1;
        break;
      }
    }
  }
  const confidence = confidence01(features?.ml_tag_confidence);
  return clamp(matches * 0.35 * Math.max(0.35, confidence), 0, 0.9);
}

function explicitQualityAdjustment(plan: SearchPlan, item: ScoredCandidate) {
  const intent = detectQualityIntent(plan.rawQuery);
  if (!intent.overall && !intent.rating && !intent.popularity) return { total: 0, reasons: [] as string[] };

  const location = locationOf(item);
  const rating = Number(location.rating ?? location.google_rating ?? location.average_rating ?? 0);
  const reviews = Number(location.review_count ?? location.user_ratings_total ?? location.google_review_count ?? 0);
  const ratingSignal = Number.isFinite(rating) && rating > 0 ? clamp((rating - 4.0) / 0.9, 0, 1) : 0;
  const reviewConfidence = Number.isFinite(reviews) && reviews > 0 ? clamp(1 - Math.exp(-reviews / 275), 0, 1) : 0;
  const popularitySignal = Number.isFinite(reviews) && reviews > 0 ? clamp(Math.log10(reviews + 1) / 3.7, 0, 1) : 0;
  const confidenceAdjustedRating = ratingSignal * (0.4 + reviewConfidence * 0.6);

  let total = 0;
  if (intent.overall) total += confidenceAdjustedRating * 2.4 + popularitySignal * 1.1;
  if (intent.rating) total += confidenceAdjustedRating * 2.4;
  if (intent.popularity) total += popularitySignal * 2.5;
  total = clamp(total, 0, 6.5);

  const reasons = total >= 0.05
    ? [`explicit quality preference +${total.toFixed(2)} (rating ${Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : "n/a"}, reviews ${Number.isFinite(reviews) && reviews > 0 ? Math.round(reviews) : 0})`]
    : [];
  return { total, reasons };
}

function compareByGeoThenScore(a: ScoredCandidate, b: ScoredCandidate) {
  return geoTierRank(a.candidate.candidate.geoMatch?.tier) - geoTierRank(b.candidate.candidate.geoMatch?.tier)
    || b.scores.total - a.scores.total;
}

export function queryRequestedBaseAdjustment(plan: SearchPlan, item: ScoredCandidate) {
  const qualityIntent = detectQualityIntent(plan.rawQuery);
  const distanceRequested = detectDistanceIntent(plan);
  const genericBestRequested = qualityIntent.overall && !qualityIntent.rating && !qualityIntent.popularity;
  const ratingRequested = qualityIntent.rating || genericBestRequested;
  const popularityRequested = qualityIntent.popularity || genericBestRequested;

  let total = 0;
  const reasons: string[] = [];

  if (!distanceRequested) {
    total += (60 - item.scores.geoFit) * 0.2;
    reasons.push("distance neutralized because proximity was not requested");
  }
  if (!ratingRequested) {
    total += (50 - item.scores.quality) * 0.1;
    reasons.push("rating/quality neutralized because it was not requested");
  }
  if (!popularityRequested) {
    total += (50 - item.scores.popularity) * 0.05;
    reasons.push("review popularity neutralized because it was not requested");
  }

  return { total, reasons, distanceRequested, ratingRequested, popularityRequested };
}

function adjustmentFor(plan: SearchPlan, item: ScoredCandidate, features: any) {
  const qualityIntent = detectQualityIntent(plan.rawQuery);
  const explicitQuality = explicitQualityAdjustment(plan, item);
  const basePolicy = queryRequestedBaseAdjustment(plan, item);
  if (!features) {
    return {
      total: basePolicy.total + explicitQuality.total,
      reasons: [...basePolicy.reasons, ...explicitQuality.reasons],
    };
  }

  const resultConfidence = confidence01(features.result_confidence_score);
  const reviewConfidence = confidence01(features.review_confidence_score);
  const bookingConfidence = confidence01(features.booking_confidence_score);
  const resultQuality = qualityIntent.overall
    ? centeredScore(features.result_quality_score, 1.6, resultConfidence)
    : 0;
  const reviewQuality = qualityIntent.overall || qualityIntent.rating
    ? centeredScore(features.overall_review_quality_score, 1.2, reviewConfidence)
    : 0;
  const wantsBooking = detectBookingIntent(plan.rawQuery);
  const booking = wantsBooking && Number.isFinite(Number(features.booking_likelihood_score))
    ? clamp((Number(features.booking_likelihood_score) / 100) * Math.max(0.35, bookingConfidence), 0, 1.0)
    : 0;
  const learnedTagFit = tagFit(plan, features);

  let total = basePolicy.total + explicitQuality.total + resultQuality + reviewQuality + booking + learnedTagFit;
  total = clamp(total, -20, 20);
  const reasons = [
    ...basePolicy.reasons,
    ...explicitQuality.reasons,
    Math.abs(resultQuality) >= 0.05 ? `requested overall quality signal ${resultQuality >= 0 ? "+" : ""}${resultQuality.toFixed(2)}` : null,
    Math.abs(reviewQuality) >= 0.05 ? `requested review quality signal ${reviewQuality >= 0 ? "+" : ""}${reviewQuality.toFixed(2)}` : null,
    booking >= 0.05 ? `requested booking likelihood +${booking.toFixed(2)}` : null,
    learnedTagFit >= 0.05 ? `requested preference fit +${learnedTagFit.toFixed(2)}` : null,
  ].filter(Boolean) as string[];
  return { total, reasons };
}

export async function applyAdvancedMlSignals({
  plan,
  supabase,
  scored,
  trace,
}: {
  plan: SearchPlan;
  supabase: SupabaseClient;
  scored: { all: ScoredCandidate[]; restaurants: ScoredCandidate[]; activities: ScoredCandidate[] };
  trace: SearchTrace;
}) {
  const ids = [...new Set(scored.all.map(idOf).filter(Boolean))];
  if (!ids.length) return scored;
  const started = performance.now();

  const applyAdjustments = (featureRows: Map<string, any>) => {
    let adjustedCount = 0;
    let maxPositive = 0;
    let maxNegative = 0;
    const adjustedByOriginal = new Map<ScoredCandidate, ScoredCandidate>();
    for (const item of scored.all) {
      const adjustment = adjustmentFor(plan, item, featureRows.get(idOf(item)));
      if (Math.abs(adjustment.total) < 0.001) {
        adjustedByOriginal.set(item, item);
        continue;
      }
      adjustedCount += 1;
      maxPositive = Math.max(maxPositive, adjustment.total);
      maxNegative = Math.min(maxNegative, adjustment.total);
      adjustedByOriginal.set(item, {
        ...item,
        scores: { ...item.scores, total: clamp(item.scores.total + adjustment.total, 0, 100) },
        reasons: [...item.reasons, ...adjustment.reasons, `query-driven ranking adjustment ${adjustment.total >= 0 ? "+" : ""}${adjustment.total.toFixed(2)}`],
      });
    }
    const mapLane = (rows: ScoredCandidate[]) => rows.map((row) => adjustedByOriginal.get(row) ?? row).sort(compareByGeoThenScore);
    return {
      all: scored.all.map((row) => adjustedByOriginal.get(row) ?? row).sort(compareByGeoThenScore),
      restaurants: mapLane(scored.restaurants),
      activities: mapLane(scored.activities),
      adjustedCount,
      maxPositive,
      maxNegative,
    };
  };

  try {
    const { data, error } = await supabase.rpc("get_search_v2_advanced_location_features", { p_location_ids: ids });
    if (error) throw error;
    const byId = new Map<string, any>((data ?? []).map((row: any) => [String(row.location_id), row]));
    const adjusted = applyAdjustments(byId);
    const qualityIntent = detectQualityIntent(plan.rawQuery);
    trace.decisions.push({
      stage: "advanced_ml_signals",
      decision: adjusted.adjustedCount ? "query_requested_signals_applied" : "no_query_requested_advanced_signal",
      reason: JSON.stringify({
        candidateCount: ids.length,
        featureRows: byId.size,
        adjustedCount: adjusted.adjustedCount,
        maxPositive: adjusted.maxPositive,
        maxNegative: adjusted.maxNegative,
        explicitQualityIntent: qualityIntent,
        distanceIntent: detectDistanceIntent(plan),
        bookingIntent: detectBookingIntent(plan.rawQuery),
        genericDistanceSuppressedWithoutRequest: true,
        genericRatingSuppressedWithoutRequest: true,
        genericPopularitySuppressedWithoutRequest: true,
        genericBehavioralMlSuppressedWithoutRequest: true,
        hardConstraintsUnaffected: true,
        latencyMs: performance.now() - started,
      }),
    });
    return { all: adjusted.all, restaurants: adjusted.restaurants, activities: adjusted.activities };
  } catch (error) {
    const adjusted = applyAdjustments(new Map<string, any>());
    trace.decisions.push({
      stage: "advanced_ml_signals",
      decision: "advanced_ml_fail_open_query_policy_preserved",
      reason: JSON.stringify({
        error: error instanceof Error ? error.message : "unknown_advanced_ml_error",
        queryDrivenBasePolicyApplied: true,
        adjustedCount: adjusted.adjustedCount,
      }),
    });
    return { all: adjusted.all, restaurants: adjusted.restaurants, activities: adjusted.activities };
  }
}
