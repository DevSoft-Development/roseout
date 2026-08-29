import type { SupabaseClient } from "@supabase/supabase-js";
import { geoTierRank } from "../geo/geoPolicy";
import type { SearchTrace } from "../observability/searchTrace";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchPair } from "./pairingTypes";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function locationId(pair: SearchPair, lane: "restaurant" | "activity") {
  return String(pair[lane].candidate.candidate.location.id);
}

function normalizeMarket(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function confidence01(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return clamp(n > 1 ? n / 100 : n, 0, 1);
}

function bestPairFeature(rows: any[], plan: SearchPlan) {
  const desiredMarket = normalizeMarket(plan.geo.market ?? plan.geo.city ?? plan.geo.borough);
  return [...rows].sort((a, b) => {
    const aMarket = normalizeMarket(a.market_key ?? a.market);
    const bMarket = normalizeMarket(b.market_key ?? b.market);
    const aMarketFit = desiredMarket && aMarket === desiredMarket ? 1 : 0;
    const bMarketFit = desiredMarket && bMarket === desiredMarket ? 1 : 0;
    return bMarketFit - aMarketFit
      || confidence01(b.confidence_score) - confidence01(a.confidence_score)
      || Number(b.sample_size ?? b.impressions_30d ?? b.shown_count ?? 0) - Number(a.sample_size ?? a.impressions_30d ?? a.shown_count ?? 0);
  })[0] ?? null;
}

function marketAdjustment(pair: SearchPair, market: any) {
  if (!market) return 0;
  const confidence = confidence01(market.confidence_score);
  if (confidence <= 0) return 0;
  const distance = Number(pair.distanceMiles ?? 0);
  const walkingPreference = Number(market.walking_preference_score ?? 0);
  const drivingPreference = Number(market.driving_preference_score ?? 0);
  const favored = distance <= 2 ? walkingPreference : drivingPreference;
  return clamp(((favored - 50) / 50) * 0.6 * confidence, -0.6, 0.6);
}

export async function applyAdvancedPairSignals({
  plan,
  pairs,
  supabase,
  trace,
}: {
  plan: SearchPlan;
  pairs: SearchPair[];
  supabase: SupabaseClient;
  trace: SearchTrace;
}) {
  if (!pairs.length) return pairs;
  const restaurantIds = [...new Set(pairs.map((pair) => locationId(pair, "restaurant")))];
  const activityIds = [...new Set(pairs.map((pair) => locationId(pair, "activity")))];
  const started = performance.now();
  try {
    const pairQuery = supabase.from("location_pair_ml_features")
      .select("restaurant_location_id,activity_location_id,intent_bucket,market,market_key,pair_score,pair_compatibility_score,confidence_score,negative_feedback_count,negative_signals_30d,sample_size,impressions_30d,shown_count")
      .in("restaurant_location_id", restaurantIds)
      .in("activity_location_id", activityIds)
      .limit(1000);
    const marketQuery = plan.geo.market || plan.geo.city || plan.geo.borough
      ? supabase.from("market_ml_features").select("market_key,walking_preference_score,driving_preference_score,confidence_score,sample_size").limit(100)
      : Promise.resolve({ data: [] as any[], error: null });
    const [{ data: pairRows, error: pairError }, { data: marketRows, error: marketError }] = await Promise.all([pairQuery, marketQuery]);
    if (pairError) throw pairError;
    if (marketError) throw marketError;

    const rowsByKey = new Map<string, any[]>();
    for (const row of pairRows ?? []) {
      const key = `${row.restaurant_location_id}:${row.activity_location_id}`;
      rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row]);
    }
    const desiredMarket = normalizeMarket(plan.geo.market ?? plan.geo.city ?? plan.geo.borough);
    const market = (marketRows ?? []).find((row: any) => normalizeMarket(row.market_key) === desiredMarket) ?? null;
    let adjustedCount = 0;

    const adjusted = pairs.map((pair) => {
      const key = `${locationId(pair, "restaurant")}:${locationId(pair, "activity")}`;
      const feature = bestPairFeature(rowsByKey.get(key) ?? [], plan);
      const confidence = confidence01(feature?.confidence_score);
      const compatibilityScore = Number(feature?.pair_compatibility_score ?? feature?.pair_score);
      const compatibility = Number.isFinite(compatibilityScore) && confidence > 0
        ? clamp(((compatibilityScore - 50) / 50) * 1.8 * confidence, -1.8, 1.8)
        : 0;
      const negatives = Number(feature?.negative_feedback_count ?? feature?.negative_signals_30d ?? 0);
      const negativePenalty = Number.isFinite(negatives) ? clamp(negatives * 0.25 * Math.max(0.4, confidence), 0, 1.2) : 0;
      const marketFit = marketAdjustment(pair, market);
      const totalAdjustment = clamp(compatibility + marketFit - negativePenalty, -2.2, 2.4);
      if (Math.abs(totalAdjustment) < 0.001) return pair;
      adjustedCount += 1;
      return {
        ...pair,
        scores: { ...pair.scores, total: pair.scores.total + totalAdjustment, mlPairBoost: pair.scores.mlPairBoost + totalAdjustment },
        reasons: [
          ...pair.reasons,
          Math.abs(compatibility) >= 0.05 ? `pair compatibility ${compatibility >= 0 ? "+" : ""}${compatibility.toFixed(2)}` : null,
          Math.abs(marketFit) >= 0.05 ? `market behavior ${marketFit >= 0 ? "+" : ""}${marketFit.toFixed(2)}` : null,
          negativePenalty >= 0.05 ? `pair negative feedback -${negativePenalty.toFixed(2)}` : null,
        ].filter(Boolean) as string[],
      } as SearchPair;
    }).sort((a, b) => geoTierRank(a.geoTier) - geoTierRank(b.geoTier) || b.scores.total - a.scores.total);

    trace.decisions.push({
      stage: "advanced_pair_ml",
      decision: adjustedCount ? "bounded_pair_signals_applied" : "no_eligible_pair_signal",
      reason: JSON.stringify({
        inputPairs: pairs.length,
        featureRows: pairRows?.length ?? 0,
        marketRows: marketRows?.length ?? 0,
        adjustedCount,
        maxPositiveBound: 2.4,
        maxNegativeBound: -2.2,
        hardPairConstraintsUnaffected: true,
        latencyMs: performance.now() - started,
      }),
    });
    return adjusted;
  } catch (error) {
    trace.decisions.push({ stage: "advanced_pair_ml", decision: "advanced_pair_ml_fail_open", reason: error instanceof Error ? error.message : "unknown_pair_ml_error" });
    return pairs;
  }
}
