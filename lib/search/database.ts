import { supabase } from "@/lib/supabase";
import type { CanonicalSearchIntent } from "@/lib/search/types";

type SearchDomain = "restaurant" | "activity";

export type SearchDebug = {
  searchedTables: string[];
  rpcCalls: string[];
  rawRestaurantCount?: number;
  rawActivityCount?: number;
  afterGeoFilterRestaurantCount?: number;
  afterGeoFilterActivityCount?: number;
  afterCategoryFilterRestaurantCount?: number;
  afterCategoryFilterActivityCount?: number;
  rankedRestaurantCount?: number;
  rankedActivityCount?: number;
  fallbackRestaurantUsed?: boolean;
  fallbackActivityUsed?: boolean;
  finalCardCounts?: { restaurants: number; activities: number; pairs: number; matched_locations: number };
  empty_reason?: string;
};

const BOROUGH_NEIGHBORHOODS: Record<string, string[]> = {
  queens: ["astoria", "flushing", "long island city", "jackson heights", "forest hills", "sunnyside", "elmhurst", "jamaica", "ridgewood", "woodside", "rockaway"],
  brooklyn: ["williamsburg", "bushwick", "park slope", "dumbo", "bed stuy", "crown heights", "greenpoint", "flatbush"],
};

const SEARCH_TEXT_FIELDS = [
  "name", "title", "category", "categories", "type", "location_type", "cuisine", "cuisines", "tags", "description", "address", "neighborhood", "borough", "city", "formatted_address", "searchable_text",
];

function normalize(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}

function includesAny(hay: string, needles: string[]) {
  return needles.some((n) => n && hay.includes(n));
}

function recordText(record: Record<string, unknown>) {
  return SEARCH_TEXT_FIELDS.map((f) => normalize(record[f])).join(" ");
}

function boroughMatches(record: Record<string, unknown>, boroughs: string[]) {
  if (!boroughs.length) return true;
  const text = recordText(record);
  return boroughs.some((raw) => {
    const b = normalize(raw);
    if (!b) return false;
    const neighbors = BOROUGH_NEIGHBORHOODS[b] ?? [];
    return text.includes(` ${b} `) || text.includes(b) || neighbors.some((n) => text.includes(n));
  });
}

function getTableDomains(table: string) {
  const lower = table.toLowerCase();
  if (lower.includes("restaurant")) return ["restaurant"] as SearchDomain[];
  if (lower.includes("activity")) return ["activity"] as SearchDomain[];
  return ["restaurant", "activity"] as SearchDomain[];
}

async function discoverSearchTables() {
  const preferred = ["restaurants", "activities", "locations"];
  const available: string[] = [];
  for (const table of preferred) {
    const { error } = await supabase.from(table).select("id", { count: "exact", head: true }).limit(1);
    if (!error) available.push(table);
  }
  return available.length ? available : ["locations"];
}

function applyDomainFilter(records: any[], domain: SearchDomain) {
  return records.filter((r) => {
    const t = recordText(r);
    const locationType = normalize(r.location_type ?? r.type ?? r.category);
    if (domain === "restaurant") {
      return locationType.includes("restaurant") || locationType.includes("food") || locationType.includes("dining") || t.includes("cuisine") || t.includes("steak") || t.includes("seafood") || t.includes("brunch");
    }
    return locationType.includes("activity") || locationType.includes("lounge") || locationType.includes("nightlife") || locationType.includes("hookah") || locationType.includes("bowling") || locationType.includes("paint");
  });
}

function categoryTerms(intent: CanonicalSearchIntent, domain: SearchDomain) {
  return domain === "restaurant" ? intent.mealFoodIntents : intent.activityIntents;
}

function softCategoryFilter(records: any[], terms: string[]) {
  if (!terms.length) return records;
  const exact = records.filter((r) => includesAny(recordText(r), terms.map((t) => normalize(t).replaceAll("_", " "))));
  return exact.length > 0 ? exact : records;
}

async function queryTable(table: string, searchText: string, limit = 80) {
  const term = searchText.trim();
  let query = supabase.from(table).select("*").limit(limit);
  if (term.length > 0) {
    const parts = term.split(/\s+/).filter(Boolean).slice(0, 4);
    const ors = parts.flatMap((p) => [
      `name.ilike.%${p}%`,
      `title.ilike.%${p}%`,
      `description.ilike.%${p}%`,
      `category.ilike.%${p}%`,
      `cuisine.ilike.%${p}%`,
      `tags.ilike.%${p}%`,
      `searchable_text.ilike.%${p}%`,
    ]);
    query = query.or(ors.join(","));
  }
  const { data } = await query;
  return data ?? [];
}

export async function searchDomain(intent: CanonicalSearchIntent, domain: SearchDomain, searchText: string, fallback = false) {
  const tables = await discoverSearchTables();
  const debug: SearchDebug = { searchedTables: tables, rpcCalls: [] };
  const merged: any[] = [];

  for (const table of tables) {
    const raw = await queryTable(table, searchText);
    const domains = getTableDomains(table);
    const scoped = domains.includes(domain) ? raw : [];
    merged.push(...scoped);
  }

  const domainRecords = applyDomainFilter(merged, domain);
  const geoFiltered = domainRecords.filter((r) => boroughMatches(r, intent.boroughs));
  const terms = categoryTerms(intent, domain);
  const categorized = softCategoryFilter(geoFiltered, terms);

  if (domain === "restaurant") {
    debug.rawRestaurantCount = domainRecords.length;
    debug.afterGeoFilterRestaurantCount = geoFiltered.length;
    debug.afterCategoryFilterRestaurantCount = categorized.length;
    debug.fallbackRestaurantUsed = fallback;
  } else {
    debug.rawActivityCount = domainRecords.length;
    debug.afterGeoFilterActivityCount = geoFiltered.length;
    debug.afterCategoryFilterActivityCount = categorized.length;
    debug.fallbackActivityUsed = fallback;
  }

  return { records: categorized, debug };
}

export const searchRestaurants = (intent: CanonicalSearchIntent) => searchDomain(intent, "restaurant", intent.restaurantSearchInput || intent.mealFoodIntents.join(" "));
export const searchActivities = (intent: CanonicalSearchIntent) => searchDomain(intent, "activity", intent.activitySearchInput || intent.activityIntents.join(" "));
export const searchFallbackRestaurants = (intent: CanonicalSearchIntent) => searchDomain(intent, "restaurant", [...intent.boroughs, "restaurant", "dinner", ...intent.mealFoodIntents].join(" "), true);
export const searchFallbackActivities = (intent: CanonicalSearchIntent) => searchDomain(intent, "activity", [...intent.boroughs, "activity", "lounge", "nightlife", ...intent.activityIntents].join(" "), true);
