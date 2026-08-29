import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHuggingFaceEmbedding, resolveHfSearchMode, resolveSearchMlRuntimeConfig, type HfSearchMode } from "../../huggingFaceEmbedding";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { RetrievalRequest } from "./retrievalTypes";
import { SEARCH_LOCATION_SELECT } from "./locationSearchSelect";

export type HfSemanticRetrievalItem = { location: any; request: RetrievalRequest; similarity: number; semanticSimilarity: number; foodSimilarity: number | null; menuSimilarity?: number | null; menuItem?: string | null };
export type HfSemanticRetrievalResult = { mode: HfSearchMode; items: HfSemanticRetrievalItem[]; candidateCount: number; embeddingMs: number; databaseMs: number; totalMs: number; error: string | null };
function domainOfRequest(request: RetrievalRequest) { return request.desiredRole === "restaurant" || request.desiredRole.endsWith("_restaurant") ? "restaurant" : "activity"; }

export function buildHfSearchQueryDocument(plan: SearchPlan) {
  return [
    `Query: ${plan.rawQuery}`,
    plan.occasion ? `Occasion: ${plan.occasion}` : "",
    plan.restaurant.cuisines.length ? `Cuisine: ${plan.restaurant.cuisines.join(", ")}` : "",
    plan.restaurant.foods.length ? `Food or dishes: ${plan.restaurant.foods.join(", ")}` : "",
    plan.restaurant.mealPeriods.length ? `Meal: ${plan.restaurant.mealPeriods.join(", ")}` : "",
    plan.restaurant.features.length ? `Restaurant features: ${plan.restaurant.features.join(", ")}` : "",
    plan.activity.categories.length ? `Activities: ${plan.activity.categories.join(", ")}` : "",
    plan.activity.features.length ? `Activity features: ${plan.activity.features.join(", ")}` : "",
    plan.preferences?.vibes?.length ? `Desired vibe: ${plan.preferences.vibes.join(", ")}` : "",
    plan.preferences?.subjectiveTerms?.length ? `Preferences: ${plan.preferences.subjectiveTerms.join(", ")}` : "",
    plan.preferences?.avoidVibes?.length ? `Avoid vibe: ${plan.preferences.avoidVibes.join(", ")}` : "",
    plan.restaurant.exclusions.length ? `Avoid restaurant: ${plan.restaurant.exclusions.join(", ")}` : "",
    plan.activity.exclusions.length ? `Avoid activity: ${plan.activity.exclusions.join(", ")}` : "",
    plan.geo.neighborhood || plan.geo.borough || plan.geo.city ? `Area: ${[plan.geo.neighborhood, plan.geo.borough, plan.geo.city].filter(Boolean).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

export async function retrieveHfSemanticRows({ plan, supabase, requests, trace }: { plan: SearchPlan; supabase: SupabaseClient; requests: RetrievalRequest[]; trace: SearchTrace }): Promise<HfSemanticRetrievalResult> {
  const totalStarted = performance.now();
  const [mode, runtimeConfig] = await Promise.all([resolveHfSearchMode(), resolveSearchMlRuntimeConfig()]);
  if (mode === "disabled" || !requests.length) return { mode, items: [], candidateCount: 0, embeddingMs: 0, databaseMs: 0, totalMs: performance.now() - totalStarted, error: null };
  try {
    const embeddingStarted = performance.now();
    const embedding = await fetchHuggingFaceEmbedding(buildHfSearchQueryDocument(plan), { timeoutMs: Number(process.env.SEARCH_HF_QUERY_EMBEDDING_TIMEOUT_MS || 900) });
    const embeddingMs = performance.now() - embeddingStarted;
    const domains = [...new Set(requests.map(domainOfRequest))] as Array<"restaurant" | "activity">;
    const foodIntent = plan.restaurant.foods.length > 0;
    const databaseStarted = performance.now();

    const semanticPromise = Promise.all(domains.map(async (domain) => {
      const { data, error } = await supabase.rpc("match_hf_location_search_embeddings", {
        p_query_embedding: embedding,
        p_expected_domain: domain,
        p_market_key: plan.geo.market,
        p_match_count: Math.max(10, Math.min(100, Number(process.env.SEARCH_HF_SEMANTIC_MATCH_COUNT || 64))),
        p_min_similarity: Number(process.env.SEARCH_HF_SEMANTIC_MIN_SIMILARITY || 0.50),
        p_embedding_version: runtimeConfig.embeddingVersion,
        p_food_intent: domain === "restaurant" && foodIntent,
      });
      if (error) throw error;
      return { domain, rows: (data ?? []) as any[] };
    }));

    const menuPromise = runtimeConfig.menuMode !== "disabled" && foodIntent
      ? supabase.rpc("match_hf_location_menu_items", {
          p_query_embedding: embedding,
          p_market_key: plan.geo.market,
          p_match_count: Math.max(20, Math.min(60, Number(process.env.SEARCH_HF_MENU_MATCH_COUNT || 48))),
          p_min_similarity: Number(process.env.SEARCH_HF_MENU_MIN_SIMILARITY || 0.58),
          p_embedding_version: runtimeConfig.embeddingVersion,
        }).then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as any[];
        })
      : Promise.resolve([] as any[]);

    const [perDomain, menuRows] = await Promise.all([semanticPromise, menuPromise]);
    const menuByLocation = new Map<string, any>();
    for (const row of menuRows) {
      const key = String(row.location_id);
      const current = menuByLocation.get(key);
      if (!current || Number(row.similarity) > Number(current.similarity)) menuByLocation.set(key, row);
    }

    const normalIds = perDomain.flatMap((lane) => lane.rows.map((row) => String(row.location_id)).filter(Boolean));
    const menuIds = runtimeConfig.menuMode === "enabled" ? [...menuByLocation.keys()] : [];
    const ids = [...new Set([...normalIds, ...menuIds])];
    const { data: locationRows, error: locationError } = ids.length
      ? await supabase.from("locations").select(SEARCH_LOCATION_SELECT).in("id", ids)
      : { data: [] as any[], error: null };
    if (locationError) throw locationError;
    const databaseMs = performance.now() - databaseStarted;
    const byId = new Map((locationRows ?? []).map((row: any) => [String(row.id), row]));
    const items: HfSemanticRetrievalItem[] = [];
    const seen = new Set<string>();

    for (const lane of perDomain) {
      const laneRequests = requests.filter((request) => domainOfRequest(request) === lane.domain);
      for (const match of lane.rows) {
        const location = byId.get(String(match.location_id));
        if (!location) continue;
        const similarity = Number(match.similarity ?? 0);
        const semanticSimilarity = Number(match.semantic_similarity ?? similarity);
        const rawFoodSimilarity = match.food_similarity == null ? null : Number(match.food_similarity);
        const foodSimilarity = rawFoodSimilarity != null && Number.isFinite(rawFoodSimilarity) ? rawFoodSimilarity : null;
        const menu = menuByLocation.get(String(match.location_id));
        const decorated = {
          ...location,
          hf_semantic_similarity: similarity,
          hf_general_similarity: semanticSimilarity,
          hf_food_similarity: foodSimilarity,
          hf_menu_similarity: menu ? Number(menu.similarity) : null,
          hf_menu_item_name: menu?.item_name ?? null,
          hf_menu_source: menu?.source ?? null,
          hf_semantic_model_version: runtimeConfig.embeddingVersion,
        };
        for (const request of laneRequests) {
          items.push({ location: decorated, request, similarity, semanticSimilarity, foodSimilarity, menuSimilarity: menu ? Number(menu.similarity) : null, menuItem: menu?.item_name ?? null });
          seen.add(`${String(location.id)}:${request.desiredRole}`);
        }
      }
    }

    if (runtimeConfig.menuMode === "enabled" && foodIntent) {
      const restaurantRequests = requests.filter((request) => domainOfRequest(request) === "restaurant");
      for (const [locationId, menu] of menuByLocation) {
        const location = byId.get(locationId);
        if (!location) continue;
        for (const request of restaurantRequests) {
          const key = `${locationId}:${request.desiredRole}`;
          if (seen.has(key)) continue;
          const similarity = Number(menu.similarity ?? 0);
          const decorated = {
            ...location,
            hf_semantic_similarity: similarity,
            hf_general_similarity: null,
            hf_food_similarity: similarity,
            hf_menu_similarity: similarity,
            hf_menu_item_name: menu.item_name,
            hf_menu_source: menu.source,
            hf_semantic_model_version: runtimeConfig.embeddingVersion,
          };
          items.push({ location: decorated, request, similarity, semanticSimilarity: similarity, foodSimilarity: similarity, menuSimilarity: similarity, menuItem: menu.item_name });
          seen.add(key);
        }
      }
    }

    const candidateCount = new Set(items.map((item) => String(item.location.id))).size;
    const totalMs = performance.now() - totalStarted;
    trace.decisions.push({
      stage: "hf_semantic_retrieval",
      decision: mode === "enabled" ? "hf_candidates_enabled" : "disabled",
      reason: JSON.stringify({
        mode,
        candidateCount,
        foodIntent,
        menuMode: runtimeConfig.menuMode,
        menuCandidateCount: menuByLocation.size,
        embeddingMs,
        databaseMs,
        totalMs,
        modelVersion: runtimeConfig.embeddingVersion,
        semanticMatchCount: Number(process.env.SEARCH_HF_SEMANTIC_MATCH_COUNT || 64),
        menuAndSemanticParallel: true,
        boundedHydration: true,
      }),
    });
    return { mode, items, candidateCount, embeddingMs, databaseMs, totalMs, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_hf_semantic_error";
    trace.decisions.push({ stage: "hf_semantic_retrieval", decision: "hf_retrieval_fallback", reason: message });
    return { mode, items: [], candidateCount: 0, embeddingMs: 0, databaseMs: 0, totalMs: performance.now() - totalStarted, error: message };
  }
}
