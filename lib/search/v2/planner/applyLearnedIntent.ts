import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchHuggingFaceEmbedding,
  fetchHuggingFaceIntentClassification,
  resolveSearchMlRuntimeConfig,
} from "../../huggingFaceEmbedding";
import type { SearchPlan } from "./searchPlanTypes";

export type LearnedIntentDiagnostics = {
  intentMode: string;
  queryMemoryMode: string;
  memorySimilarity: number | null;
  memoryUsed: boolean;
  classifierUsed: boolean;
  classifierConfidence: number | null;
  additions: string[];
  error: string | null;
};

const MEMORY_FOOD_CONTROL_TERMS = new Set([
  "same venue",
  "same place",
  "one venue",
  "one place",
  "under one roof",
  "all in one place",
  "same",
  "venue",
  "place",
  "under",
  "one",
  "roof",
  "walking distance",
  "walking",
  "walk",
  "walkable",
  "distance",
  "on foot",
  "driving",
  "drive",
  "by car",
  "car ride",
]);

const MEMORY_FOOD_CONTROL_PHRASE = /\b(?:same (?:venue|place)|one (?:venue|place)|under one roof|all in one place|walking distance|walkable|on foot|by car|car ride)\b/i;

function normalizeMemoryFoodTerm(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeRememberedRestaurantFoods(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value) => {
      const normalized = normalizeMemoryFoodTerm(value);
      return !MEMORY_FOOD_CONTROL_TERMS.has(normalized) && !MEMORY_FOOD_CONTROL_PHRASE.test(normalized);
    }))];
}

function sanitizePlanRestaurantFoods(plan: SearchPlan): SearchPlan {
  const foods = sanitizeRememberedRestaurantFoods(plan.restaurant.foods);
  if (
    foods.length === plan.restaurant.foods.length &&
    foods.every((food, index) => food === plan.restaurant.foods[index])
  ) {
    return plan;
  }
  return {
    ...plan,
    restaurant: {
      ...plan.restaurant,
      foods,
    },
  };
}

function mergeUnique(base: readonly string[], additions: unknown) {
  const out = new Set(base.map(String));
  if (Array.isArray(additions)) for (const value of additions) if (String(value || "").trim()) out.add(String(value).trim());
  return [...out];
}

function applySafeMemory(plan: SearchPlan, memoryPlan: any, additions: string[]): SearchPlan {
  let next: any = plan;
  if (!plan.restaurant.cuisines.length && Array.isArray(memoryPlan?.restaurant?.cuisines) && memoryPlan.restaurant.cuisines.length) {
    next = { ...next, restaurant: { ...next.restaurant, cuisines: mergeUnique(next.restaurant.cuisines, memoryPlan.restaurant.cuisines) } };
    additions.push("restaurant.cuisines");
  }
  if (!plan.restaurant.foods.length) {
    const safeRememberedFoods = sanitizeRememberedRestaurantFoods(memoryPlan?.restaurant?.foods);
    if (safeRememberedFoods.length) {
      next = { ...next, restaurant: { ...next.restaurant, foods: mergeUnique(next.restaurant.foods, safeRememberedFoods) } };
      additions.push("restaurant.foods");
    }
  }
  if (plan.activity.required && !plan.activity.categories.length && Array.isArray(memoryPlan?.activity?.categories) && memoryPlan.activity.categories.length) {
    next = { ...next, activity: { ...next.activity, categories: mergeUnique(next.activity.categories, memoryPlan.activity.categories) } };
    additions.push("activity.categories");
  }
  if (!plan.preferences?.vibes?.length && Array.isArray(memoryPlan?.preferences?.vibes) && memoryPlan.preferences.vibes.length) {
    next = { ...next, preferences: { ...(next.preferences ?? { avoidVibes: [], subjectiveTerms: [], budget: null, noise: null }), vibes: mergeUnique([], memoryPlan.preferences.vibes) } };
    additions.push("preferences.vibes");
  }
  if (!plan.occasion && typeof memoryPlan?.occasion === "string" && memoryPlan.occasion.trim()) {
    next = { ...next, occasion: memoryPlan.occasion.trim() };
    additions.push("occasion");
  }
  // Deliberately never copy mode, required domains, geo, exclusions, travel, anchor, pairing distance, or audience constraints.
  return next as SearchPlan;
}

export async function applyLearnedIntent({ plan, supabase }: { plan: SearchPlan; supabase: SupabaseClient }) {
  const config = await resolveSearchMlRuntimeConfig();
  const diagnostics: LearnedIntentDiagnostics = {
    intentMode: config.intentMode,
    queryMemoryMode: config.queryMemoryMode,
    memorySimilarity: null,
    memoryUsed: false,
    classifierUsed: false,
    classifierConfidence: null,
    additions: [],
    error: null,
  };
  const sanitizedPlan = sanitizePlanRestaurantFoods(plan);
  if (config.intentMode === "disabled" && config.queryMemoryMode === "disabled") return { plan: sanitizedPlan, diagnostics };

  try {
    const embedding = await fetchHuggingFaceEmbedding(sanitizedPlan.rawQuery, { timeoutMs: 900 });
    let next = sanitizedPlan;
    if (config.queryMemoryMode !== "disabled") {
      const { data, error } = await supabase.rpc("match_search_semantic_query_memory", {
        p_query_embedding: embedding,
        p_market_key: sanitizedPlan.geo.market,
        p_match_count: 1,
        p_min_similarity: 0.93,
        p_embedding_version: config.embeddingVersion,
      });
      if (error) throw error;
      const memory = Array.isArray(data) ? data[0] : null;
      diagnostics.memorySimilarity = memory ? Number(memory.similarity ?? 0) : null;
      if (memory && Number(memory.similarity ?? 0) >= 0.93 && Number(memory.confidence ?? 0) >= 0.88) {
        if (config.queryMemoryMode === "enabled") next = applySafeMemory(next, memory.search_plan, diagnostics.additions);
        diagnostics.memoryUsed = config.queryMemoryMode === "enabled" && diagnostics.additions.length > 0;
      }
    }

    const hasOpenSemanticSlots = !next.preferences?.vibes?.length || (next.activity.required && !next.activity.categories.length);
    if (config.intentMode !== "disabled" && hasOpenSemanticSlots) {
      const classification = await fetchHuggingFaceIntentClassification(next.rawQuery, { timeoutMs: 1000 });
      diagnostics.classifierUsed = true;
      diagnostics.classifierConfidence = classification.confidence;
      if (config.intentMode === "enabled" && classification.confidence >= 0.78) {
        if (next.activity.required && !next.activity.categories.length && classification.activityTypes.length) {
          next = { ...next, activity: { ...next.activity, categories: mergeUnique(next.activity.categories, classification.activityTypes) } } as SearchPlan;
          diagnostics.additions.push("classifier.activity.categories");
        }
        if (!next.preferences?.vibes?.length && classification.vibes.length) {
          next = { ...next, preferences: { ...(next.preferences ?? { avoidVibes: [], subjectiveTerms: [], budget: null, noise: null }), vibes: mergeUnique([], classification.vibes) } as any } as SearchPlan;
          diagnostics.additions.push("classifier.preferences.vibes");
        }
      }
    }
    return { plan: next, diagnostics };
  } catch (error) {
    diagnostics.error = error instanceof Error ? error.message : "learned_intent_failed";
    return { plan: sanitizedPlan, diagnostics };
  }
}

export async function rememberSuccessfulQuery({ plan, supabase, success }: { plan: SearchPlan; supabase: SupabaseClient; success: boolean }) {
  const config = await resolveSearchMlRuntimeConfig();
  if (config.queryMemoryMode === "disabled" || !success || plan.confidence.overall < 0.88) return;
  try {
    const embedding = await fetchHuggingFaceEmbedding(plan.rawQuery, { timeoutMs: 900 });
    const normalizedQuery = plan.rawQuery.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const memoryKey = `${plan.geo.market ?? "any"}:${normalizedQuery}`.slice(0, 500);
    await supabase.from("search_semantic_query_memory").upsert({
      memory_key: memoryKey,
      representative_query: plan.rawQuery,
      normalized_query: normalizedQuery,
      query_embedding: embedding,
      search_plan: plan,
      market_key: plan.geo.market,
      source: plan.parser.source,
      confidence: plan.confidence.overall,
      success_score: 1,
      positive_signals: 1,
      review_status: plan.parser.source === "deterministic" && plan.confidence.overall >= 0.94 ? "approved" : "candidate",
      embedding_model: config.embeddingModel,
      embedding_version: config.embeddingVersion,
      plan_version: plan.version,
      updated_at: new Date().toISOString(),
    }, { onConflict: "memory_key" });
  } catch {
    // Memory must never block a search response.
  }
}
