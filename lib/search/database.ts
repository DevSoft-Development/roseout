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
  fallbackRestaurantUsed?: boolean;
  fallbackActivityUsed?: boolean;
};

const SEARCHED_TABLE = "locations";

const BOROUGH_NEIGHBORHOODS: Record<string, string[]> = {
  queens: ["astoria", "flushing", "long island city", "jackson heights", "forest hills", "sunnyside", "elmhurst", "jamaica", "ridgewood", "woodside", "rockaway"],
  brooklyn: ["williamsburg", "bushwick", "park slope", "dumbo", "bed stuy", "crown heights", "greenpoint", "flatbush"],
};

const SEARCH_TEXT_FIELDS = [
  "name", "title", "category", "categories", "type", "location_type", "cuisine", "cuisines", "tags", "description", "address", "neighborhood", "borough", "city", "formatted_address", "search_document", "searchable_text",
];

const n = (v: unknown) => String(v ?? "").toLowerCase().trim();
const text = (record: Record<string, unknown>) => SEARCH_TEXT_FIELDS.map((f) => n(record[f])).join(" ");

function boroughMatches(record: Record<string, unknown>, boroughs: string[]) {
  if (!boroughs.length) return true;
  const hay = text(record);
  return boroughs.some((requested) => {
    const b = n(requested);
    if (!b) return false;
    return hay.includes(b) || (BOROUGH_NEIGHBORHOODS[b] ?? []).some((q) => hay.includes(q));
  });
}

function isDomainMatch(record: Record<string, unknown>, domain: SearchDomain) {
  const hay = text(record);
  const marker = n(record.location_type ?? record.type ?? record.category);
  if (domain === "restaurant") {
    return marker.includes("restaurant") || marker.includes("food") || marker.includes("dining") || hay.includes("steak") || hay.includes("seafood") || hay.includes("brunch");
  }
  return marker.includes("activity") || marker.includes("lounge") || marker.includes("nightlife") || hay.includes("hookah") || hay.includes("bowling") || hay.includes("paint");
}

function softCategoryFilter(records: any[], terms: string[]) {
  if (!terms.length) return records;
  const normalized = terms.map((t) => n(t).replaceAll("_", " "));
  const exact = records.filter((record) => normalized.some((term) => text(record).includes(term)));
  return exact.length > 0 ? exact : records;
}

async function queryLocations(searchText: string, limit = 80) {
  const term = searchText.trim();
  let query = supabase.from(SEARCHED_TABLE).select("*").limit(limit);

  if (term.length > 0) {
    const parts = term.split(/\s+/).filter(Boolean).slice(0, 4);
    const ors = parts.flatMap((p) => [
      `name.ilike.%${p}%`,
      `title.ilike.%${p}%`,
      `description.ilike.%${p}%`,
      `category.ilike.%${p}%`,
      `cuisine.ilike.%${p}%`,
      `tags.ilike.%${p}%`,
      `search_document.ilike.%${p}%`,
      `searchable_text.ilike.%${p}%`,
      `address.ilike.%${p}%`,
      `borough.ilike.%${p}%`,
      `city.ilike.%${p}%`,
      `neighborhood.ilike.%${p}%`,
      `formatted_address.ilike.%${p}%`,
    ]);
    query = query.or(ors.join(","));
  }

  const { data, error } = await query;
  if (error) {
    console.error("search query failed", error);
    return [];
  }
  return data ?? [];
}

async function searchDomain(intent: CanonicalSearchIntent, domain: SearchDomain, searchText: string, fallback = false) {
  const records = await queryLocations(searchText);
  const domainRecords = records.filter((record) => isDomainMatch(record, domain));
  const geoFiltered = domainRecords.filter((record) => boroughMatches(record, intent.boroughs));
  const terms = domain === "restaurant" ? intent.mealFoodIntents : intent.activityIntents;
  const categorized = softCategoryFilter(geoFiltered, terms);

  const debug: SearchDebug = { searchedTables: [SEARCHED_TABLE], rpcCalls: [] };
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
