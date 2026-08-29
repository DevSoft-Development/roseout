import type { SupabaseClient } from "@supabase/supabase-js";
import { geoTierRank } from "../geo/geoPolicy";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { ScoredCandidate } from "./scoringTypes";

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

function compareByGeoThenScore(a: ScoredCandidate, b: ScoredCandidate) {
  return geoTierRank(a.candidate.candidate.geoMatch?.tier) - geoTierRank(b.candidate.candidate.geoMatch?.tier)
    || b.scores.total - a.scores.total;
}

function adjustmentFor(plan: SearchPlan, item: ScoredCandidate, features: any) {
  if (!features) return { total: 0, reasons: [] as string[] };
  const resultConfidence = confidence01(features.result_confidence_score);
  const reviewConfidence = confidence01(features.review_confidence_score);
  const bookingConfidence = confidence01(features.booking_confidence_score);
  const resultQuality = centeredScore(features.result_quality_score, 1.6, resultConfidence);
  const reviewQuality = centeredScore(features.overall_review_quality_score, 1.2, reviewConfidence);
  const wantsBooking = /\b(book|booking|reserve|reservation)\b/i.test(plan.rawQuery);
  const booking = Number.isFinite(Number(features.booking_likelihood_score))
    ? clamp((Number(features.booking_likelihood_score) / 100) * (wantsBooking ? 1.0 : 0.25) * Math.max(0.35, bookingConfidence), 0, wantsBooking ? 1.0 : 0.25)
    : 0;
  const trust = Number.isFinite(Number(features.business_trust_score))
    ? clamp((Number(features.business_trust_score) - 50) / 50 * 0.6, -0.4, 0.6)
    : 0;
  const duplicatePenalty = Number.isFinite(Number(features.duplicate_risk_score))
    ? clamp(Number(features.duplicate_risk_score) / 100 * 1.2, 0, 1.2)
    : 0;
  const negativePenalty = Number.isFinite(Number(features.negative_feedback_rate))
    ? clamp(Number(features.negative_feedback_rate) * 3.0 * Math.max(0.4, resultConfidence), 0, 2.0)
    : 0;
  const learnedTagFit = tagFit(plan, features);

  let total = clamp(resultQuality + reviewQuality + booking + trust + learnedTagFit - duplicatePenalty - negativePenalty, -2.5, 3.5);
  const exactMenu = item.reasons.some((reason) => /exact menu phrase match/i.test(reason));
  if (exactMenu) total = Math.max(0, total);

  const reasons = [
    Math.abs(resultQuality) >= 0.05 ? `behavioral result quality ${resultQuality >= 0 ? "+" : ""}${resultQuality.toFixed(2)}` : null,
    Math.abs(reviewQuality) >= 0.05 ? `review intelligence ${reviewQuality >= 0 ? "+" : ""}${reviewQuality.toFixed(2)}` : null,
    booking >= 0.05 ? `booking likelihood +${booking.toFixed(2)}` : null,
    Math.abs(trust) >= 0.05 ? `business quality ${trust >= 0 ? "+" : ""}${trust.toFixed(2)}` : null,
    learnedTagFit >= 0.05 ? `learned location fit +${learnedTagFit.toFixed(2)}` : null,
    negativePenalty >= 0.05 ? `negative feedback -${negativePenalty.toFixed(2)}` : null,
    duplicatePenalty >= 0.05 ? `duplicate risk -${duplicatePenalty.toFixed(2)}` : null,
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
  try {
    const { data, error } = await supabase.rpc("get_search_v2_advanced_location_features", { p_location_ids: ids });
    if (error) throw error;
    const byId = new Map((data ?? []).map((row: any) => [String(row.location_id), row]));
    let adjustedCount = 0;
    let maxPositive = 0;
    let maxNegative = 0;
    const adjustedByOriginal = new Map<ScoredCandidate, ScoredCandidate>();
    for (const item of scored.all) {
      const adjustment = adjustmentFor(plan, item, byId.get(idOf(item)));
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
        reasons: [...item.reasons, ...adjustment.reasons, `bounded advanced ML ${adjustment.total >= 0 ? "+" : ""}${adjustment.total.toFixed(2)}`],
      });
    }
    const mapLane = (rows: ScoredCandidate[]) => rows.map((row) => adjustedByOriginal.get(row) ?? row).sort(compareByGeoThenScore);
    const all = scored.all.map((row) => adjustedByOriginal.get(row) ?? row).sort(compareByGeoThenScore);
    trace.decisions.push({
      stage: "advanced_ml_signals",
      decision: adjustedCount ? "bounded_advanced_signals_applied" : "no_eligible_advanced_signal",
      reason: JSON.stringify({
        candidateCount: ids.length,
        featureRows: byId.size,
        adjustedCount,
        maxPositive,
        maxNegative,
        maxPositiveBound: 3.5,
        maxNegativeBound: -2.5,
        exactMenuDemotionBlocked: true,
        hardConstraintsUnaffected: true,
        latencyMs: performance.now() - started,
      }),
    });
    return { all, restaurants: mapLane(scored.restaurants), activities: mapLane(scored.activities) };
  } catch (error) {
    trace.decisions.push({
      stage: "advanced_ml_signals",
      decision: "advanced_ml_fail_open",
      reason: error instanceof Error ? error.message : "unknown_advanced_ml_error",
    });
    return scored;
  }
}
