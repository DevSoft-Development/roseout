import {
  fetchHuggingFaceRerank,
  resolveHfRerankMode,
  resolveSearchMlRuntimeConfig,
  type HfSearchMode,
} from "../../huggingFaceEmbedding";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { geoTierRank } from "../geo/geoPolicy";
import { buildHfSearchQueryDocument } from "../retrieval/retrieveHfSemanticRows";
import type { ScoredCandidate } from "./scoringTypes";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function locationOf(item: ScoredCandidate) {
  return item.candidate.candidate.location as Record<string, any>;
}

function idOf(item: ScoredCandidate) {
  return String(locationOf(item)?.id ?? "");
}

function textList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(", ");
  return value == null ? "" : String(value);
}

export function buildHfRerankDocument(item: ScoredCandidate) {
  const location = locationOf(item);
  return [
    `Name: ${textList(location.name ?? location.restaurant_name ?? location.activity_name)}`,
    `Type: ${textList(location.primary_category ?? location.location_type ?? location.activity_type)}`,
    `Cuisine: ${textList(location.cuisine ?? location.cuisine_type)}`,
    `Foods: ${textList(location.foods)}`,
    `Menu highlights: ${textList(location.signature_items ?? location.menu_highlights)}`,
    `Features: ${textList(location.special_features ?? location.tags)}`,
    `Vibes: ${textList(location.vibe_tags ?? location.semantic_tags ?? location.best_for_tags)}`,
    `Area: ${[location.neighborhood, location.borough, location.city].filter(Boolean).join(", ")}`,
    `Description: ${textList(location.approved_description ?? location.description)}`,
  ].filter((line) => !line.endsWith(": ")).join("\n");
}

function compareByGeoThenScore(a: ScoredCandidate, b: ScoredCandidate) {
  const aTier = a.candidate.candidate.geoMatch?.tier;
  const bTier = b.candidate.candidate.geoMatch?.tier;
  return geoTierRank(aTier) - geoTierRank(bTier) || b.scores.total - a.scores.total;
}

function semanticAdjustment(plan: SearchPlan, item: ScoredCandidate) {
  const location = locationOf(item);
  const semanticSimilarity = Number(location.hf_semantic_similarity ?? 0);
  const foodSimilarity = Number(location.hf_food_similarity ?? 0);
  const semanticBoost = semanticSimilarity >= 0.50
    ? clamp((semanticSimilarity - 0.50) / 0.40 * Number(process.env.SEARCH_HF_SEMANTIC_MAX_BOOST || 5), 0, Number(process.env.SEARCH_HF_SEMANTIC_MAX_BOOST || 5))
    : 0;
  const foodBoost = plan.restaurant.foods.length && foodSimilarity >= 0.50
    ? clamp((foodSimilarity - 0.50) / 0.40 * Number(process.env.SEARCH_HF_FOOD_MAX_BOOST || 8), 0, Number(process.env.SEARCH_HF_FOOD_MAX_BOOST || 8))
    : 0;
  return { semanticSimilarity, foodSimilarity, semanticBoost, foodBoost };
}

async function rerankLane({
  plan,
  items,
  lane,
  mode,
  modelVersion,
}: {
  plan: SearchPlan;
  items: ScoredCandidate[];
  lane: "restaurant" | "activity";
  mode: HfSearchMode;
  modelVersion: string;
}) {
  if (!items.length) return { served: items, ranked: items, latencyMs: 0, rerankedCount: 0, error: null as string | null };
  const limit = Math.max(5, Math.min(60, Number(process.env.SEARCH_HF_RERANK_CANDIDATE_LIMIT || 24)));
  const head = items.slice(0, limit);
  const tail = items.slice(limit);
  const query = buildHfSearchQueryDocument(plan);
  const started = performance.now();
  try {
    const results = await fetchHuggingFaceRerank(query, head.map(buildHfRerankDocument), {
      timeoutMs: Number(process.env.SEARCH_HF_RERANK_REQUEST_TIMEOUT_MS || 1800),
      topN: head.length,
    });
    const scoreByIndex = new Map(results.map((row) => [row.index, row]));
    const maxBoost = Number(process.env.SEARCH_HF_RERANK_MAX_BOOST || 7);
    const maxDemotion = Number(process.env.SEARCH_HF_RERANK_MAX_DEMOTION || 4);
    const adjusted = head.map((item, index) => {
      const hf = scoreByIndex.get(index);
      if (!hf) return item;
      const exactMenu = item.reasons.some((reason) => reason.includes("exact menu phrase match"));
      const normalized = clamp(Number(hf.score), 0, 1);
      let rerankAdjustment = clamp((normalized - 0.50) * 2 * maxBoost, -maxDemotion, maxBoost);
      if (exactMenu) rerankAdjustment = Math.max(0, rerankAdjustment);
      const semantic = semanticAdjustment(plan, item);
      const totalAdjustment = rerankAdjustment + semantic.semanticBoost + semantic.foodBoost;
      const nextTotal = clamp(item.scores.total + totalAdjustment, 0, 100);
      const reasons = [
        ...item.reasons,
        `HF reranker ${modelVersion} score ${normalized.toFixed(3)} adjustment ${rerankAdjustment >= 0 ? "+" : ""}${rerankAdjustment.toFixed(2)}`,
        semantic.semanticBoost ? `HF semantic relevance +${semantic.semanticBoost.toFixed(2)} (${semantic.semanticSimilarity.toFixed(3)})` : null,
        semantic.foodBoost ? `HF menu semantic relevance +${semantic.foodBoost.toFixed(2)} (${semantic.foodSimilarity.toFixed(3)})` : null,
      ].filter(Boolean) as string[];
      return {
        ...item,
        scores: { ...item.scores, total: nextTotal },
        reasons,
        ml: { ...item.ml },
        hf: {
          modelVersion,
          score: normalized,
          rawScore: hf.rawScore,
          rerankAdjustment,
          semanticBoost: semantic.semanticBoost,
          foodBoost: semantic.foodBoost,
          totalAdjustment,
          lane,
        },
      } as ScoredCandidate;
    });
    const ranked = [...adjusted, ...tail].sort(compareByGeoThenScore);
    return {
      served: mode === "enabled" ? ranked : items,
      ranked,
      latencyMs: performance.now() - started,
      rerankedCount: results.length,
      error: null as string | null,
    };
  } catch (error) {
    return {
      served: items,
      ranked: items,
      latencyMs: performance.now() - started,
      rerankedCount: 0,
      error: error instanceof Error ? error.message : "unknown_hf_rerank_error",
    };
  }
}

export async function applyHfReranking({
  plan,
  scored,
  trace,
}: {
  plan: SearchPlan;
  scored: { all: ScoredCandidate[]; restaurants: ScoredCandidate[]; activities: ScoredCandidate[] };
  trace: SearchTrace;
}) {
  const [mode, runtimeConfig] = await Promise.all([resolveHfRerankMode(), resolveSearchMlRuntimeConfig()]);
  if (mode === "disabled") return scored;

  const [restaurants, activities] = await Promise.all([
    rerankLane({ plan, items: scored.restaurants, lane: "restaurant", mode, modelVersion: runtimeConfig.rerankVersion }),
    rerankLane({ plan, items: scored.activities, lane: "activity", mode, modelVersion: runtimeConfig.rerankVersion }),
  ]);
  const servedSet = new Set([...restaurants.served, ...activities.served]);
  const servedAll = [...scored.all.filter((item) => servedSet.has(item))].sort(compareByGeoThenScore);

  trace.decisions.push({
    stage: "hf_cross_encoder_rerank",
    decision: mode === "enabled" ? "hf_rerank_enabled" : "hf_rerank_disabled",
    reason: JSON.stringify({
      mode,
      modelVersion: runtimeConfig.rerankVersion,
      candidateLimit: Number(process.env.SEARCH_HF_RERANK_CANDIDATE_LIMIT || 24),
      timeoutMs: Number(process.env.SEARCH_HF_RERANK_REQUEST_TIMEOUT_MS || 1800),
      restaurantReranked: restaurants.rerankedCount,
      activityReranked: activities.rerankedCount,
      restaurantLatencyMs: restaurants.latencyMs,
      activityLatencyMs: activities.latencyMs,
      restaurantError: restaurants.error,
      activityError: activities.error,
      restaurantControlTop: scored.restaurants.slice(0, 10).map(idOf),
      restaurantHfTop: restaurants.ranked.slice(0, 10).map(idOf),
      activityControlTop: scored.activities.slice(0, 10).map(idOf),
      activityHfTop: activities.ranked.slice(0, 10).map(idOf),
    }),
  });

  return {
    all: mode === "enabled" ? servedAll : scored.all,
    restaurants: restaurants.served,
    activities: activities.served,
  };
}
