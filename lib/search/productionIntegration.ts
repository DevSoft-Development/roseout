import type { EnterpriseLocation, EnterprisePair, EnterpriseSearchResult } from "@/lib/search/enterprise/types";
import { evaluateCandidateEligibility } from "@/lib/search/enterprise/classification";
import { fuseSearchCandidates } from "@/lib/search/enterprise/semantic";
import { haversineMiles } from "@/lib/search/enterprise/distance";
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
const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();

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

function shouldUseSemantic(query: string) {
  if (!flag("SEARCH_SEMANTIC_ENABLED", true)) return false;
  if (flag("SEARCH_SEMANTIC_ALWAYS", false)) return true;
  return /\b(romantic|intimate|chill|quiet|conversation|talk|upscale|classy|casual|low key|low-key|laid back|laid-back|rooftop|lively|cozy|fun|interesting|different|vibe|date night|girls night|family|not too|affordable|budget|premium)\b/i.test(query);
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

async function semanticCandidates(embedding: number[] | null, domain: "restaurant" | "activity", market: string | null) {
  if (!embedding) return [];
  const { data, error } = await supabaseAdmin.rpc("match_location_search_embeddings", {
    p_query_embedding: embedding,
    p_expected_domain: domain,
    p_market_key: market,
    p_match_count: Number(process.env.SEARCH_SEMANTIC_MATCH_COUNT || 60),
    p_min_similarity: Number(process.env.SEARCH_SEMANTIC_MIN_SIMILARITY || 0.55),
    p_embedding_version: process.env.SEARCH_EMBEDDING_VERSION || "search-embedding:v1",
  });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    locationId: String(row.location_id),
    similarity: Number(row.similarity ?? 0),
  }));
}

function searchPlanOf(result: any) {
  return result?.searchPlan ?? result?.search_plan ?? result?.debug?.searchPlan ?? result?.debug?.search_plan ?? null;
}

function matchesRequestedGeo(row: any, result: any) {
  const plan = searchPlanOf(result);
  const geo = plan?.geo;
  if (!geo) return true;

  const neighborhood = normalize(geo.neighborhood);
  const borough = normalize(geo.borough);
  const city = normalize(geo.city);
  const county = normalize(geo.county);
  const rowNeighborhood = normalize(row?.neighborhood);
  const rowBorough = normalize(row?.borough);
  const rowCity = normalize(row?.city);
  const rowCounty = normalize(row?.county);

  if (geo.strictness === "strict") {
    if (neighborhood && rowNeighborhood !== neighborhood && rowCity !== neighborhood) return false;
    if (!neighborhood && borough && rowBorough !== borough) return false;
    if (!neighborhood && !borough && city && rowCity !== city) return false;
    if (!neighborhood && !borough && !city && county && rowCounty !== county) return false;
  }

  if (geo.latitude != null && geo.longitude != null && geo.radiusMiles != null && plan?.travel?.constraint === "hard") {
    const lat = Number(row?.latitude);
    const lng = Number(row?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    const distance = haversineMiles(Number(geo.latitude), Number(geo.longitude), lat, lng);
    if (distance > Number(geo.radiusMiles)) return false;
    row.distance_miles = distance;
  }
  return true;
}

async function loadSemanticRescueRows(
  semantic: Array<{ locationId: string; similarity: number }>,
  existingRows: EnterpriseLocation[],
  domain: "restaurant" | "activity",
  result: any,
) {
  if (!semantic.length || flag("SEARCH_SEMANTIC_SHADOW_ONLY", false)) return [] as EnterpriseLocation[];
  const existing = new Set(existingRows.map(idOf));
  const candidates = semantic.filter((item) => !existing.has(item.locationId)).slice(0, Number(process.env.SEARCH_SEMANTIC_RESCUE_LIMIT || 24));
  if (!candidates.length) return [] as EnterpriseLocation[];
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .in("id", candidates.map((item) => item.locationId));
  if (error) throw error;
  const similarity = new Map(candidates.map((item) => [item.locationId, item.similarity]));
  return filterLane((data ?? []) as EnterpriseLocation[], domain)
    .filter((row) => matchesRequestedGeo(row, result))
    .map((row: any) => ({
      ...row,
      search_score: Math.max(scoreOf(row), Number(similarity.get(idOf(row)) ?? 0) * 100),
      semantic_similarity: Number(similarity.get(idOf(row)) ?? 0),
      semantic_retrieval: true,
    }));
}

function dedupeRows(rows: EnterpriseLocation[]) {
  const byId = new Map<string, EnterpriseLocation>();
  for (const row of rows) {
    const id = idOf(row);
    if (id && !byId.has(id)) byId.set(id, row);
  }
  return [...byId.values()];
}

async function rerankLane(
  rows: EnterpriseLocation[],
  query: string,
  domain: "restaurant" | "activity",
  market: string | null,
  queryEmbedding: number[] | null,
  result: any,
) {
  const semantic = await semanticCandidates(queryEmbedding, domain, market).catch(() => []);
  const rescued = await loadSemanticRescueRows(semantic, rows, domain, result).catch(() => []);
  const pool = dedupeRows([...rows, ...rescued]);
  if (!pool.length) return { control: rows, semantic: pool, hybrid: pool, debug: { candidates: 0, semanticCandidates: semantic.length, semanticRescued: 0 } };

  const ids = pool.map(idOf).filter(Boolean);
  const behavior = await loadBehavioralRows(ids);
  const fused = fuseSearchCandidates({
    structuredCandidates: rows.map((row) => ({ locationId: idOf(row), score: scoreOf(row) })),
    lexicalCandidates: pool
      .map((row) => ({ locationId: idOf(row), score: lexicalScore(row, query) }))
      .sort((a, b) => Number(b.score) - Number(a.score)),
    semanticCandidates: semantic,
  });
  const fusionMap = new Map(fused.map((row) => [row.locationId, row]));
  const semanticOrder = [...pool].sort((a, b) => {
    const fusedA = Number(fusionMap.get(idOf(a))?.fusionScore ?? 0) * 1000;
    const fusedB = Number(fusionMap.get(idOf(b))?.fusionScore ?? 0) * 1000;
    return (scoreOf(b) + fusedB) - (scoreOf(a) + fusedA);
  });
  const hybrid = [...pool].sort((a, b) => {
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
    semantic: semanticOrder,
    hybrid,
    debug: {
      candidates: rows.length,
      servedPool: pool.length,
      semanticCandidates: semantic.length,
      semanticRescued: rescued.length,
      behaviorRows: behavior.size,
    },
  };
}

function rerankPairsByLanes(pairs: EnterprisePair[], restaurants: EnterpriseLocation[], activities: EnterpriseLocation[]) {
  const restaurantRank = new Map(restaurants.map((row, index) => [idOf(row), index]));
  const activityRank = new Map(activities.map((row, index) => [idOf(row), index]));
  return [...pairs].sort((a, b) => {
    const aRank = (restaurantRank.get(idOf(a.restaurant)) ?? 9999) + (activityRank.get(idOf(a.activity)) ?? 9999);
    const bRank = (restaurantRank.get(idOf(b.restaurant)) ?? 9999) + (activityRank.get(idOf(b.activity)) ?? 9999);
    return aRank - bRank;
  });
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

    const market = String(mutable?.debug?.resolvedMarket ?? mutable?.debug?.resolved_market ?? mutable?.searchPlan?.geo?.market ?? "") || null;
    const semanticRequested = shouldUseSemantic(query);
    const queryEmbedding = semanticRequested ? await embedQuery(query).catch(() => null) : null;
    const settings = await getRankingRolloutSettings();
    const assignment = assignRankingVariant({
      identityKey: String(rolloutContext.identityKey || "anonymous"),
      market,
      isAdmin: Boolean(rolloutContext.isAdmin),
      settings,
    });

    const [restaurants, activities] = await Promise.all([
      rerankLane(mutable.restaurants, query, "restaurant", market, queryEmbedding, mutable),
      rerankLane(mutable.activities, query, "activity", market, queryEmbedding, mutable),
    ]);

    const semanticServed = Boolean(queryEmbedding) && !flag("SEARCH_SEMANTIC_SHADOW_ONLY", false);
    mutable.restaurants = semanticServed
      ? (assignment.variant === "hybrid" ? restaurants.hybrid : restaurants.semantic)
      : (assignment.variant === "hybrid" ? restaurants.hybrid.filter((row) => restaurants.control.some((original) => idOf(original) === idOf(row))) : restaurants.control);
    mutable.activities = semanticServed
      ? (assignment.variant === "hybrid" ? activities.hybrid : activities.semantic)
      : (assignment.variant === "hybrid" ? activities.hybrid.filter((row) => activities.control.some((original) => idOf(original) === idOf(row))) : activities.control);
    mutable.pairs = rerankPairsByLanes(mutable.pairs, mutable.restaurants, mutable.activities);

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
    const restaurantHybridOrder = restaurants.hybrid.map(idOf);
    const activityControlOrder = activities.control.map(idOf);
    const activityHybridOrder = activities.hybrid.map(idOf);
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
          semanticRequested,
          semanticServed,
        },
      }).catch(() => undefined);
    }

    mutable.debug = {
      ...(mutable.debug ?? {}),
      phase13ProductionIntegration: {
        status: "ready",
        fallbackUsed: false,
        behavioralEnabled: flag("SEARCH_BEHAVIORAL_RERANK_ENABLED", false),
        semanticEnabled: flag("SEARCH_SEMANTIC_ENABLED", true),
        semanticRequested,
        semanticServed,
        semanticEmbeddingGenerated: Boolean(queryEmbedding),
        hybridApply: assignment.variant === "hybrid",
        rankingVariant: assignment.variant,
        rolloutEligible: assignment.eligible,
        rolloutPercent: settings.rollout_percent,
        rolloutBucket: assignment.bucket,
        modelVersion: settings.model_version,
        restaurant: restaurants.debug,
        activity: activities.debug,
        restaurantControlOrder,
        restaurantSemanticOrder: restaurants.semantic.map(idOf),
        restaurantShadowOrder: restaurantHybridOrder,
        activityControlOrder,
        activitySemanticOrder: activities.semantic.map(idOf),
        activityShadowOrder: activityHybridOrder,
        pairRerankedBySemanticLaneOrder: semanticServed,
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