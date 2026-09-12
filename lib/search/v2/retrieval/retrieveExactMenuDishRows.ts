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

const CONTROL_DISH_TERMS = new Set(["only", "best", "restaurant", "restaurants", "food", "dinner", "lunch", "brunch"]);

function isRestaurantRequest(request: RetrievalRequest) {
  return request.desiredRole === "restaurant" || request.desiredRole.endsWith("_restaurant");
}

function specificDishTerms(requests: readonly RetrievalRequest[]) {
  const terms = [...new Set(
    requests
      .filter(isRestaurantRequest)
      .flatMap((request) => request.foods)
      .map(normalizeDish)
      .filter((term) => term.length >= 3 && !CONTROL_DISH_TERMS.has(term)),
  )];
  return terms
    .sort((a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length)
    .slice(0, 8);
}

function menuItemContainsPhrase(itemName: unknown, phrase: string) {
  const item = normalizeDish(itemName);
  return item === phrase || ` ${item} `.includes(` ${phrase} `);
}

type MenuEvidence = { item: string; source: string; priority: number };

function addEvidence(map: Map<string, MenuEvidence[]>, locationId: unknown, evidence: MenuEvidence) {
  const id = String(locationId ?? "").trim();
  if (!id || !evidence.item) return;
  const current = map.get(id) ?? [];
  const normalized = normalizeDish(evidence.item);
  const existingIndex = current.findIndex((entry) => normalizeDish(entry.item) === normalized);
  if (existingIndex >= 0) {
    if (evidence.priority > current[existingIndex].priority) current[existingIndex] = evidence;
  } else {
    current.push(evidence);
  }
  map.set(id, current);
}

async function loadPublishedOwnerMenuEvidence(supabase: SupabaseClient, phrases: string[], menuMatches: Map<string, MenuEvidence[]>) {
  const candidateItems: any[] = [];
  for (const phrase of phrases) {
    const escaped = phrase.replace(/,/g, " ");
    const { data, error } = await supabase
      .from("location_commerce_items")
      .select("location_id,commerce_page_id,name,description,is_available")
      .eq("is_available", true)
      .or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
      .limit(80);
    if (error) throw error;
    for (const row of data ?? []) {
      if (!menuItemContainsPhrase(`${row.name ?? ""} ${row.description ?? ""}`, phrase)) continue;
      candidateItems.push(row);
    }
  }

  const pageIds = [...new Set(candidateItems.map((row) => String(row.commerce_page_id ?? "")).filter(Boolean))];
  if (!pageIds.length) return 0;
  const { data: pages, error: pageError } = await supabase
    .from("location_commerce_pages")
    .select("id,location_id,status,is_active")
    .in("id", pageIds)
    .eq("status", "published")
    .eq("is_active", true);
  if (pageError) throw pageError;
  const publishedPages = new Set((pages ?? []).map((page: any) => String(page.id)));
  let added = 0;
  for (const row of candidateItems) {
    if (!publishedPages.has(String(row.commerce_page_id))) continue;
    addEvidence(menuMatches, row.location_id, { item: String(row.name ?? "").trim(), source: "owner_published_menu", priority: 3 });
    added += 1;
  }
  return added;
}

/**
 * Exact menu inventory is authoritative evidence for authored dishes.
 * Published owner menus are read live so edits/unpublishes take effect immediately.
 * Website/crawler/profile menu intelligence enters through ready embeddings.
 */
export async function retrieveExactMenuDishRows({ plan, supabase, requests, trace }: { plan: SearchPlan; supabase: SupabaseClient; requests: RetrievalRequest[]; trace: SearchTrace; }) {
  const restaurantRequest = requests.find(isRestaurantRequest);
  const phrases = specificDishTerms(requests);
  if (!restaurantRequest || !phrases.length) return [] as Array<{ location: any; request: RetrievalRequest }>;

  const started = performance.now();
  try {
    const menuMatches = new Map<string, MenuEvidence[]>();
    for (const phrase of phrases) {
      const { data, error } = await supabase
        .from("location_menu_item_embeddings_hf")
        .select("location_id,item_name,normalized_item_name,status,source")
        .eq("status", "ready")
        .ilike("normalized_item_name", `%${phrase}%`)
        .limit(80);
      if (error) throw error;
      for (const row of data ?? []) {
        if (!menuItemContainsPhrase(row.normalized_item_name ?? row.item_name, phrase)) continue;
        const source = String(row.source ?? "menu_intelligence");
        // Owner menu embeddings are deliberately not trusted for exact inventory;
        // the canonical commerce tables above are read live to prevent stale deleted/unpublished dishes.
        if (/owner|commerce/i.test(source)) continue;
        const priority = /website|crawl|scrap|menu/i.test(source) ? 2 : 1;
        addEvidence(menuMatches, row.location_id, { item: String(row.item_name ?? row.normalized_item_name ?? phrase).trim(), source, priority });
      }
    }

    const ownerEvidenceCount = await loadPublishedOwnerMenuEvidence(supabase, phrases, menuMatches);
    const ids = [...menuMatches.keys()];
    if (!ids.length) {
      trace.decisions.push({ stage: "exact_menu_dish_retrieval", decision: "no_ready_exact_menu_match", reason: JSON.stringify({ phrases, ownerEvidenceCount, latencyMs: performance.now() - started }) });
      return [] as Array<{ location: any; request: RetrievalRequest }>;
    }

    const { data: locations, error: locationError } = await supabase.from("locations").select(SEARCH_LOCATION_SELECT).in("id", ids).eq("is_searchable", true);
    if (locationError) throw locationError;

    const projected = (locations ?? [])
      .filter((row: any) => row?.is_hidden !== true)
      .map((row: any) => {
        const evidence = [...(menuMatches.get(String(row.id)) ?? [])].sort((a, b) => b.priority - a.priority);
        const items = evidence.map((entry) => entry.item);
        const sources = [...new Set(evidence.map((entry) => entry.source))];
        return {
          location: {
            ...row,
            signature_items: [...new Set([...(Array.isArray(row.signature_items) ? row.signature_items : []), ...items])],
            exact_menu_inventory_match: true,
            exact_menu_inventory_items: items,
            exact_menu_inventory_sources: sources,
            exact_menu_inventory_priority: evidence[0]?.priority ?? 1,
          },
          request: restaurantRequest,
        };
      });

    trace.decisions.push({ stage: "exact_menu_dish_retrieval", decision: projected.length ? "ready_exact_menu_candidates_added" : "exact_menu_matches_not_publicly_searchable", reason: JSON.stringify({ phrases, ownerEvidenceCount, menuLocationCount: ids.length, candidateCount: projected.length, market: plan.geo.market, latencyMs: performance.now() - started }) });
    return projected;
  } catch (error) {
    trace.decisions.push({ stage: "exact_menu_dish_retrieval", decision: "exact_menu_retrieval_fail_open", reason: error instanceof Error ? error.message : "unknown exact menu retrieval failure" });
    return [] as Array<{ location: any; request: RetrievalRequest }>;
  }
}
