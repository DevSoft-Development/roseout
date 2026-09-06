import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { RetrievalRequest } from "./retrievalTypes";
import { SEARCH_LOCATION_SELECT } from "./locationSearchSelect";

const normalizeDish = (value: unknown) => String(value ?? "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9\s]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function isRestaurantRequest(request: RetrievalRequest) {
  return request.desiredRole === "restaurant" || request.desiredRole.endsWith("_restaurant");
}

function specificDishTerms(requests: readonly RetrievalRequest[]) {
  return [...new Set(
    requests
      .filter(isRestaurantRequest)
      .flatMap((request) => request.foods)
      .map(normalizeDish)
      .filter((term) => term.length >= 5 && term.split(" ").filter(Boolean).length >= 2),
  )]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
}

function menuItemContainsPhrase(itemName: unknown, phrase: string) {
  const item = normalizeDish(itemName);
  return item === phrase || ` ${item} `.includes(` ${phrase} `);
}

/**
 * Exact menu inventory is authoritative evidence for specific authored dishes.
 * It is intentionally separate from semantic retrieval: a restaurant that has
 * the requested dish in ready menu intelligence should enter the candidate pool
 * even when its canonical location profile has not absorbed that food phrase.
 */
export async function retrieveExactMenuDishRows({
  plan,
  supabase,
  requests,
  trace,
}: {
  plan: SearchPlan;
  supabase: SupabaseClient;
  requests: RetrievalRequest[];
  trace: SearchTrace;
}) {
  const restaurantRequest = requests.find(isRestaurantRequest);
  const phrases = specificDishTerms(requests);
  if (!restaurantRequest || !phrases.length) {
    return [] as Array<{ location: any; request: RetrievalRequest }>;
  }

  const started = performance.now();
  try {
    const menuMatches = new Map<string, string[]>();
    for (const phrase of phrases) {
      const { data, error } = await supabase
        .from("location_menu_item_embeddings_hf")
        .select("location_id,item_name,normalized_item_name,status")
        .eq("status", "ready")
        .ilike("normalized_item_name", `%${phrase}%`)
        .limit(40);
      if (error) throw error;
      for (const row of data ?? []) {
        if (!menuItemContainsPhrase(row.normalized_item_name ?? row.item_name, phrase)) continue;
        const id = String(row.location_id ?? "");
        if (!id) continue;
        const names = menuMatches.get(id) ?? [];
        const itemName = String(row.item_name ?? row.normalized_item_name ?? phrase).trim();
        if (itemName && !names.includes(itemName)) names.push(itemName);
        menuMatches.set(id, names);
      }
    }

    const ids = [...menuMatches.keys()];
    if (!ids.length) {
      trace.decisions.push({
        stage: "exact_menu_dish_retrieval",
        decision: "no_ready_exact_menu_match",
        reason: JSON.stringify({ phrases, latencyMs: performance.now() - started }),
      });
      return [] as Array<{ location: any; request: RetrievalRequest }>;
    }

    const { data: locations, error: locationError } = await supabase
      .from("locations")
      .select(SEARCH_LOCATION_SELECT)
      .in("id", ids)
      .eq("is_searchable", true);
    if (locationError) throw locationError;

    const projected = (locations ?? [])
      .filter((row: any) => row?.is_hidden !== true)
      .map((row: any) => ({
        location: {
          ...row,
          signature_items: [...new Set([...(Array.isArray(row.signature_items) ? row.signature_items : []), ...(menuMatches.get(String(row.id)) ?? [])])],
          exact_menu_inventory_match: true,
          exact_menu_inventory_items: menuMatches.get(String(row.id)) ?? [],
        },
        request: restaurantRequest,
      }));

    trace.decisions.push({
      stage: "exact_menu_dish_retrieval",
      decision: projected.length ? "ready_exact_menu_candidates_added" : "exact_menu_matches_not_publicly_searchable",
      reason: JSON.stringify({
        phrases,
        menuLocationCount: ids.length,
        candidateCount: projected.length,
        market: plan.geo.market,
        latencyMs: performance.now() - started,
      }),
    });
    return projected;
  } catch (error) {
    trace.decisions.push({
      stage: "exact_menu_dish_retrieval",
      decision: "exact_menu_retrieval_fail_open",
      reason: error instanceof Error ? error.message : "unknown exact menu retrieval failure",
    });
    return [] as Array<{ location: any; request: RetrievalRequest }>;
  }
}
