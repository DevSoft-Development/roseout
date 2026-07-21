import type { EnterpriseLocation, EnterprisePair, EnterpriseSearchResult } from "@/lib/search/enterprise/types";
import { evaluateCandidateEligibility } from "@/lib/search/enterprise/classification";
import { fuseSearchCandidates } from "@/lib/search/enterprise/semantic";
import { calculateBehavioralAdjustments, stablePairKey } from "@/lib/ml/behavioralFeatures";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  assignRankingVariant,
  getRankingRolloutSettings,
  logRankingExperiment,
} from "@/lib/search/rankingRollout";

const flag = (name: string, fallback = false) => {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
};

const idOf = (row: any) => String(row?.id ?? row?.location_id ?? "");
const scoreOf = (row: any) => Number(row?.final_score ?? row?.search_score ?? row?.score ?? 0);
const textOf = (row: any) => [
  row?.name,
  row?.restaurant_name,
  row?.activity_name,
  row?.primary_category,
  row?.cuisine,
  row?.activity_type,
  ...(Array.isArray(row?.tags) ? row.tags : []),
].filter(Boolean).join(" ").toLowerCase();

export type Phase4DRolloutContext = {
  identityKey?: string | null;
  searchId?: string | null;
  isAdmin?: boolean;
  source?: string | null;
  route?: string | null;
};

function lexicalScore(row: EnterpriseLocation, query: string) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  if (!terms.length) return 0;
  const haystack = textOf(row);
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) / terms.length;
}

function filterLane(rows: EnterpriseLocation[], expectedDomain: "restaurant" | "activity") {
  return rows.filter((location) =>
    evaluateCandidateEligibility({
      location,
      expectedDomain,
      lane: "production_integration_final",
    }).eligible,
  );
}

function filterPairs(rows: EnterprisePair[]) {
  return rows.filter((pair) => {
    const restaurant = evaluateCandidateEligibility({
      location: pair.restaurant,
      expectedDomain: "restaurant",
      lane: "production_integration_pair",
    });
    const activity = evaluateCandidateEligibility({
      location: pair.activity,
      expectedDomain: "activity",
      lane: "production_integration_pair",
    });
    return restaurant.eligible && activity.eligible && idOf(pair.restaurant) !== idOf(pair.activity);
  });
}

async function loadBehavioralRows(locationIds: string[]) {
  if (!flag("SEARCH_BEHAVIORAL_RERANK_ENABLED", false) || !locationIds.length) {
    return new Map<string, any>();
  }
  const { data, error } = await supabaseAdmin
    .from("search_result_ml_features")
    .select("location_id,result_quality_score,confidence_score,status,calculated_at,feature_version")
    .in("location_id", locationIds)
    .eq("feature_window", "30d");
  if (error) throw error;
  return new Map((data ?? []).map((row: any) => [String(row.location_id), row]));
}

async function embedQuery(query: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const model = process.env.SEARCH_EMBEDDING_MODEL || "text-embedding-3-small";
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: query }),
  });
  if (!response.ok) throw new Error(`embedding request failed: ${response.status}`);
  const payload = await response.json();
  return payload?.data?.[0]?.embedding as number[];
}

async function semanticCandidates(query: string, domain: "restaurant" | "activity", market: string | null) {
  if (!flag("SEARCH_SEMANTIC_ENABLED", false)) return [];
  const embedding = await embedQuery(query);
  const { data, error } = await supabaseAdmin.rpc("match_location_search_embeddings", {
    p_query_embedding: embedding,
    p_expected_domain: domain,
    p_market_key: market,
    p_match_count: 100,
    p_min_similarity: Number(process.env.SEARCH_SEMANTIC_MIN_SIMILARITY || 0.55),
    p_embedding_version: process.env.SEARCH_EMBEDDING_VERSION || "search-embedding:v1",
  });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    locationId: String(row.location_id),
    similarity: Number(row.similarity ?? 0),
  }));
}

async function rerankLane(
  rows: EnterpriseLocation[],
  query: string,
  domain: "restaurant" | "activity",
  market: string | null,
) {
  if (!rows.length) return { control: rows, shadow: rows, debug: { candidates: 0 } };
  const ids = rows.map(idOf).filter(Boolean);
  const behavior = await loadBehavioralRows(ids);
  const semantic = await semanticCandidates(query, domain, market).catch(() => []);
  const fused = fuseSearchCandidates({
    structuredCandidates: rows.map((row) => ({ locationId: idOf(row), score: scoreOf(row) })),
    lexicalCandidates: rows
      .map((row) => ({ locationId: idOf(row), score: lexicalScore(row, query) }))
      .sort((a, b) => Number(b.score) - Number(a.score)),
    semanticCandidates: semantic,
  });
  const fusionMap = new Map(fused.map((row) => [row.locationId, row]));
  const shadow = [...rows].sort((a, b) => {
    const featureA = behavior.get(idOf(a));
    const featureB = behavior.get(idOf(b));
    const adjustA = calculateBehavioralAdjustments({
      resultQualityScore: featureA?.result_quality_score,
      confidence: featureA?.confidence_score,
    });
    const adjustB = calculateBehavioralAdjustments({
      resultQualityScore: featureB?.result_quality_score,
      confidence: featureB?.confidence_score,
    });
    const fusedA = Number(fusionMap.get(idOf(a))?.fusionScore ?? 0) * 1000;
    const fusedB = Number(fusionMap.get(idOf(b))?.fusionScore ?? 0) * 1000;
    return (scoreOf(b) + fusedB + adjustB.totalAppliedBoost) -
      (scoreOf(a) + fusedA + adjustA.totalAppliedBoost);
  });
  return {
    control: rows,
    shadow,
    debug: {
      candidates: rows.length,
      semanticCandidates: semantic.length,
      behaviorRows: behavior.size,
    },
  };
}

export async function applyPhase13ProductionIntegration(
  result: EnterpriseSearchResult,
  query: string,
  rolloutContext: Phase4DRolloutContext = {},
): Promise<EnterpriseSearchResult> {
  if (!flag("SEARCH_PHASE13_INTEGRATION_ENABLED", true)) return result;
  const startedAt = Date.now();
  try {
    const mutable = result as any;
    mutable.restaurants = filterLane(Array.isArray(mutable.restaurants) ? mutable.restaurants : [], "restaurant");
    mutable.activities = filterLane(Array.isArray(mutable.activities) ? mutable.activities : [], "activity");
    mutable.pairs = filterPairs(Array.isArray(mutable.pairs) ? mutable.pairs : []);

    const market = String(mutable?.debug?.resolvedMarket ?? mutable?.debug?.resolved_market ?? "") || null;
    const settings = await getRankingRolloutSettings();
    const assignment = assignRankingVariant({
      identityKey: String(rolloutContext.identityKey || "anonymous"),
      market,
      isAdmin: Boolean(rolloutContext.isAdmin),
      settings,
    });

    const [restaurants, activities] = await Promise.all([
      rerankLane(mutable.restaurants, query, "restaurant", market),
      rerankLane(mutable.activities, query, "activity", market),
    ]);

    mutable.restaurants = assignment.variant === "hybrid" ? restaurants.shadow : restaurants.control;
    mutable.activities = assignment.variant === "hybrid" ? activities.shadow : activities.control;
    for (const pair of mutable.pairs) {
      (pair as any).pair_key = stablePairKey(idOf(pair.restaurant), idOf(pair.activity));
    }
    mutable.card_counts = {
      ...(mutable.card_counts ?? {}),
      restaurants: mutable.restaurants.length,
      activities: mutable.activities.length,
      pairs: mutable.pairs.length,
    };

    const restaurantControlOrder = restaurants.control.map(idOf);
    const restaurantHybridOrder = restaurants.shadow.map(idOf);
    const activityControlOrder = activities.control.map(idOf);
    const activityHybridOrder = activities.shadow.map(idOf);
    const noResults = !mutable.restaurants.length && !mutable.activities.length && !mutable.pairs.length;

    if (assignment.eligible) {
      await logRankingExperiment({
        searchId: rolloutContext.searchId ?? null,
        assignmentKeyHash: assignment.assignmentKeyHash,
        variant: assignment.variant,
        rolloutPercent: settings.rollout_percent,
        market,
        adminEligible: Boolean(rolloutContext.isAdmin),
        modelVersion: settings.model_version,
        restaurantControlOrder,
        restaurantHybridOrder,
        activityControlOrder,
        activityHybridOrder,
        latencyMs: Date.now() - startedAt,
        noResults,
        pairCount: mutable.pairs.length,
        metadata: {
          bucket: assignment.bucket,
          source: rolloutContext.source ?? null,
          route: rolloutContext.route ?? null,
        },
      }).catch(() => undefined);
    }

    mutable.debug = {
      ...(mutable.debug ?? {}),
      phase13ProductionIntegration: {
        status: "ready",
        fallbackUsed: false,
        behavioralEnabled: flag("SEARCH_BEHAVIORAL_RERANK_ENABLED", false),
        semanticEnabled: flag("SEARCH_SEMANTIC_ENABLED", false),
        hybridApply: assignment.variant === "hybrid",
        rankingVariant: assignment.variant,
        rolloutEligible: assignment.eligible,
        rolloutPercent: settings.rollout_percent,
        rolloutBucket: assignment.bucket,
        modelVersion: settings.model_version,
        restaurant: restaurants.debug,
        activity: activities.debug,
        restaurantControlOrder,
        restaurantShadowOrder: restaurantHybridOrder,
        activityControlOrder,
        activityShadowOrder: activityHybridOrder,
      },
    };
    return mutable;
  } catch (error) {
    const mutable = result as any;
    mutable.debug = {
      ...(mutable.debug ?? {}),
      phase13ProductionIntegration: {
        status: "fallback",
        fallbackUsed: true,
        rankingVariant: "control",
        error: error instanceof Error ? error.message : "unknown_error",
      },
    };
    return mutable;
  }
}
