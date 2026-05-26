import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CanonicalSearchIntent } from "@/lib/search/types";

type SearchDomain = "restaurant" | "activity";

export type SearchDebug = {
  searchedTables: string[];
  rpcCalls: string[];
  sourceErrors?: string[];
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

const GENERIC_RESTAURANT_TERMS = new Set([
  "dinner", "lunch", "breakfast", "brunch", "restaurant", "restaurants", "food", "eat", "dining",
]);

const FOOD_SYNONYMS: Record<string, string[]> = {
  steak: ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon"],
  steakhouse: ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon"],
  seafood: ["seafood", "fish", "crab", "lobster", "shrimp", "oyster"],
  sushi: ["sushi", "sashimi", "omakase", "japanese"],
  pasta: ["pasta", "italian"],
  italian: ["italian", "pasta"],
  mexican: ["mexican", "taco", "tacos"],
  caribbean: ["caribbean", "jamaican", "haitian"],
  soul_food: ["soul food", "southern"],
  burgers: ["burger", "burgers"],
  pizza: ["pizza"],
  tacos: ["taco", "tacos"],
  vegan: ["vegan"],
  vegetarian: ["vegetarian"],
  halal: ["halal"],
  fine_dining: ["fine dining", "upscale", "steakhouse"],
};

const BOROUGH_NEIGHBORHOODS: Record<string, string[]> = {
  queens: ["astoria", "flushing", "long island city", "jackson heights", "forest hills", "sunnyside", "elmhurst", "jamaica", "ridgewood", "woodside", "rockaway"],
  brooklyn: ["williamsburg", "bushwick", "park slope", "dumbo", "bed stuy", "crown heights", "greenpoint", "flatbush"],
};

const SAFE_REMOTE_TEXT_FIELDS = [
  "name", "restaurant_name", "activity_name", "location_type", "source_table", "primary_category", "cuisine", "cuisine_type", "food_type", "activity_type", "primary_tag", "description", "address", "neighborhood", "borough", "city", "state", "zip_code", "search_document", "semantic_search_text",
];

const SEARCH_TEXT_FIELDS = [
  "name", "restaurant_name", "activity_name", "location_type", "source_table", "primary_category", "cuisine", "cuisine_type", "food_type", "activity_type", "primary_tag", "description", "address", "neighborhood", "borough", "city", "state", "zip_code", "search_document", "semantic_search_text", "tags", "vibe_tags", "best_for_tags", "google_types", "search_keywords", "review_keywords", "semantic_tags", "intent_tags",
];

function stringifySearchValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v ?? "")).join(" ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

const n = (v: unknown) => stringifySearchValue(v).toLowerCase().trim();
const text = (record: Record<string, unknown>) => SEARCH_TEXT_FIELDS.map((f) => n(record[f])).join(" ");

function hasAnyToken(hay: string, tokens: string[]) {
  return tokens.some((token) => hay.includes(token));
}

function boroughMatches(record: Record<string, unknown>, boroughs: string[]) {
  if (!boroughs.length) return true;
  const hay = text(record);
  return boroughs.some((requested) => {
    const b = n(requested);
    if (!b) return false;
    return hay.includes(b) || (BOROUGH_NEIGHBORHOODS[b] ?? []).some((q) => hay.includes(q));
  });
}

export function inferRecordDomain(record: Record<string, unknown>): SearchDomain | null {
  const hay = text(record);
  const marker = n(
    record.location_type ??
      record.primary_category ??
      record.primary_tag ??
      record.restaurant_name ??
      record.activity_name ??
      record.source_table,
  );

  const restaurantTokens = ["restaurant", "restaurants", "food", "dining", "cuisine", "brunch", "lunch", "dinner", "breakfast", "cafe"];
  const activityTokens = ["activity", "activities", "nightlife", "experience", "lounge", "bar", "club", "event", "things to do"];

  const restaurantHit = hasAnyToken(marker, restaurantTokens) || hasAnyToken(hay, ["steak", "seafood", "brunch", "restaurant", "cuisine"]);
  const activityHit = hasAnyToken(marker, activityTokens) || hasAnyToken(hay, ["hookah", "bowling", "paint", "karaoke", "nightlife"]);

  if (restaurantHit && !activityHit) return "restaurant";
  if (activityHit && !restaurantHit) return "activity";
  if (restaurantHit) return "restaurant";
  if (activityHit) return "activity";
  return null;
}

function isDomainMatch(record: Record<string, unknown>, domain: SearchDomain) {
  const inferred = inferRecordDomain(record);
  if (inferred) return inferred === domain;
  const hay = text(record);
  return domain === "restaurant" ? hasAnyToken(hay, ["food", "eat", "dining"]) : hasAnyToken(hay, ["activity", "nightlife", "experience"]);
}

function getSpecificFoodTerms(intent: CanonicalSearchIntent) {
  const specific = intent.specificMealFoodIntents ?? [];
  if (specific.length > 0) return specific;

  return (intent.mealFoodIntents ?? []).filter((term) => !GENERIC_RESTAURANT_TERMS.has(String(term).toLowerCase()));
}

function recordSearchText(record: Record<string, unknown>) {
  return text(record);
}

function matchesSpecificFoodIntent(record: Record<string, unknown>, terms: string[]) {
  if (!terms.length) return true;

  const hay = recordSearchText(record);

  return terms.some((term) => {
    const normalized = String(term ?? "").toLowerCase().replaceAll("_", " ").trim();
    const synonyms = FOOD_SYNONYMS[normalized] ?? FOOD_SYNONYMS[normalized.replaceAll(" ", "_")] ?? [normalized];
    return synonyms.some((synonym) => hay.includes(String(synonym).toLowerCase()));
  });
}

function softCategoryFilter(records: any[], terms: string[]) {
  if (!terms.length) return records;
  const normalized = terms.map((t) => n(t).replaceAll("_", " "));
  const exact = records.filter((record) => normalized.some((term) => text(record).includes(term)));
  return exact.length > 0 ? exact : records;
}

export async function queryLocations(searchText: string, limit = 120) {
  const term = searchText.trim();

  let query = supabaseAdmin
    .from("locations")
    .select("*")
    .eq("is_searchable", true)
    .neq("data_status", "hidden")
    .not("is_hidden", "is", true)
    .limit(limit);

  if (term.length > 0) {
    const parts = term.split(/\s+/).map((p) => p.trim()).filter(Boolean).slice(0, 6);
    const ors = parts.flatMap((p) => SAFE_REMOTE_TEXT_FIELDS.map((field) => `${field}.ilike.%${p}%`));
    query = query.or(ors.join(","));
  }

  const { data, error } = await query;
  if (error) {
    console.error("THEOUTHAVEN_LOCATION_SEARCH_ERROR", {
      searchText,
      fields: SAFE_REMOTE_TEXT_FIELDS,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    return {
      records: [],
      error: `${error.code ?? "SEARCH_ERROR"}: ${error.message ?? "unknown_search_error"}`,
    };
  }

  return { records: data ?? [], error: null };
}

export async function queryBroadLocations(limit = 500) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("is_searchable", true)
    .neq("data_status", "hidden")
    .not("is_hidden", "is", true)
    .limit(limit);

  if (error) {
    console.error("THEOUTHAVEN_BROAD_LOCATION_SEARCH_ERROR", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    return {
      records: [],
      error: `${error.code ?? "BROAD_SEARCH_ERROR"}: ${error.message ?? "unknown_broad_search_error"}`,
    };
  }

  return { records: data ?? [], error: null };
}

async function searchDomain(intent: CanonicalSearchIntent, domain: SearchDomain, searchText: string, fallback = false) {
  const sourceErrors: string[] = [];
  const queryResult = await queryLocations(searchText);
  if (queryResult.error) sourceErrors.push(queryResult.error);

  let records = queryResult.records;
  if (records.length === 0) {
    const broadResult = await queryBroadLocations(500);
    if (broadResult.error) sourceErrors.push(broadResult.error);
    const terms = searchText.toLowerCase().split(/\s+/).filter(Boolean);
    records = broadResult.records.filter((record) => {
      const hay = text(record);
      return terms.some((term) => hay.includes(term));
    });
  }

  const domainRecords = records.filter((record) => isDomainMatch(record, domain));
  const geoFiltered = domainRecords.filter((record) => boroughMatches(record, intent.boroughs));
  const terms = domain === "restaurant" ? getSpecificFoodTerms(intent) : intent.activityIntents;
  let categorized = softCategoryFilter(geoFiltered, terms);

  if (domain === "restaurant") {
    const strictFoodTerms = getSpecificFoodTerms(intent);

    if (strictFoodTerms.length > 0) {
      const strictMatches = geoFiltered.filter((record) => matchesSpecificFoodIntent(record, strictFoodTerms));
      categorized = strictMatches.length > 0 ? strictMatches : [];
    }
  }

  const debug: SearchDebug = { searchedTables: [SEARCHED_TABLE], rpcCalls: [], sourceErrors };
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
export const searchFallbackRestaurants = (intent: CanonicalSearchIntent) => searchDomain(intent, "restaurant", [
  ...intent.boroughs,
  "restaurant",
  ...((intent.specificMealFoodIntents?.length ?? 0) > 0 ? intent.specificMealFoodIntents : intent.mealFoodIntents),
].join(" "), true);
export const searchFallbackActivities = (intent: CanonicalSearchIntent) => searchDomain(intent, "activity", [...intent.boroughs, "activity", "lounge", "nightlife", ...intent.activityIntents].join(" "), true);
