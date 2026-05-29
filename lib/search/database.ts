import { supabaseAdmin } from "../supabase-admin";
import type { CanonicalSearchIntent } from "./types";
import { detectRequestedGeo, locationMatchesGeo, scoreGeoMatch } from "./geo-matching";
import { scoreCuisineCategoryMatch } from "./cuisine-matching";

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
  rejectedRecords?: Array<{ name: string; reason: string; domain?: string | null }>;
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
const STEAK_TERMS = ["steakhouse", "steak house", "steak", "american steakhouse", "brazilian steakhouse", "churrasco", "ribeye", "filet mignon", "porterhouse", "sirloin", "tomahawk steak"];

const BOROUGH_NEIGHBORHOODS: Record<string, string[]> = {
  queens: ["queens", "astoria", "flushing", "long island city", "lic", "jackson heights", "forest hills", "sunnyside", "elmhurst", "jamaica", "ridgewood", "woodside", "bayside", "corona", "fresh meadows", "rego park", "ozone park", "queens village", "springfield gardens", "rockaway"],
  manhattan: ["manhattan", "harlem", "upper east side", "upper west side", "midtown", "chelsea", "soho", "lower east side", "east village", "west village", "tribeca", "financial district"],
  bronx: ["bronx", "south bronx", "riverdale", "fordham", "pelham bay", "morris park"],
  brooklyn: ["brooklyn", "williamsburg", "bushwick", "park slope", "dumbo", "bed stuy", "crown heights", "greenpoint", "flatbush", "downtown brooklyn"],
  "staten island": ["staten island"],
};

const SAFE_REMOTE_TEXT_FIELDS = [
  "name", "restaurant_name", "activity_name", "location_type", "source_table", "primary_category", "cuisine", "cuisine_type", "food_type", "activity_type", "primary_tag", "description", "address", "neighborhood", "borough", "city", "state", "zip_code", "search_document", "semantic_search_text",
];

const SEARCH_TEXT_FIELDS = [
  "name", "restaurant_name", "activity_name", "location_type", "source_table", "primary_category", "cuisine", "cuisine_type", "food_type", "activity_type", "primary_tag", "description", "address", "neighborhood", "borough", "city", "state", "zip_code", "search_document", "semantic_search_text", "tags", "vibe_tags", "best_for_tags", "google_types", "search_keywords", "review_keywords", "semantic_tags", "intent_tags",
];

const MEAL_TERMS = [
  "steak", "steakhouse", "seafood", "sushi", "italian", "mexican", "caribbean", "dinner", "brunch", "lunch", "restaurant", "food", "fine dining", "rooftop dinner", "date night dinner",
];

const ADD_ON_ACTIVITY_TERMS = [
  "hookah", "hookah lounge", "lounge", "nightclub", "club", "karaoke", "bowling", "arcade", "vr", "paint", "sip and paint", "paint and sip", "activity", "experience", "rooftop",
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

function locationText(location: Record<string, unknown>) {
  return [
    location.source_table, location.location_type, location.type, location.category, location.primary_category, location.name, location.restaurant_name, location.activity_name, location.business_name, location.cuisine, location.cuisine_type, location.activity_type, location.description, ...(Array.isArray(location.tags) ? location.tags : []), ...(Array.isArray(location.vibes) ? location.vibes : []),
  ].map((value) => stringifySearchValue(value)).filter(Boolean).join(" ").toLowerCase();
}

function isRestaurantRecord(location: Record<string, unknown>) {
  const hay = locationText(location);
  if (n(location.source_table) === "restaurants") return true;
  if (location.restaurant_name) return true;
  if (location.cuisine || location.cuisine_type || location.food_type) return true;
  return hasAnyToken(hay, [
    "restaurant", "dining", "dinner", "brunch", "lunch", "food", "steakhouse", "seafood", "sushi", "italian", "mexican", "caribbean", "american", "cafe", "bakery", "dessert", "bar and grill", "grill", "bistro",
  ]);
}

function isActivityOnlyRecord(location: Record<string, unknown>) {
  const hay = locationText(location);
  const hasActivitySignal = hasAnyToken(hay, [
    "hookah", "lounge", "nightclub", "club", "karaoke", "bowling", "arcade", "vr", "paint", "sip and paint", "museum", "escape room", "activity", "experience",
  ]);
  return hasActivitySignal && !isRestaurantRecord(location);
}

function hasMealIntent(query: string) {
  const q = query.toLowerCase();
  return MEAL_TERMS.some((term) => q.includes(term));
}
function hasAddOnActivityIntent(query: string) {
  const q = query.toLowerCase();
  return ADD_ON_ACTIVITY_TERMS.some((term) => q.includes(term));
}
function getMealTermsFromQuery(query: string) {
  const q = query.toLowerCase();
  return MEAL_TERMS.filter((term) => q.includes(term));
}
function getActivityTermsFromQuery(query: string) {
  const q = query.toLowerCase();
  return ADD_ON_ACTIVITY_TERMS.filter((term) => q.includes(term));
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

function matchesGeo(record: Record<string, unknown>, query: string) {
  const q = query.toLowerCase();
  const hay = [
    record.borough, record.city, record.neighborhood, record.address, record.formatted_address, record.search_document, record.semantic_search_text, record.location,
  ].map((value) => stringifySearchValue(value)).filter(Boolean).join(" ").toLowerCase();

  const boroughList = ["queens", "brooklyn", "manhattan", "bronx", "staten island"];
  const requestedBorough = boroughList.find((borough) => q.includes(borough));
  if (requestedBorough) {
    return (
      hay.includes(requestedBorough) ||
      (BOROUGH_NEIGHBORHOODS[requestedBorough] ?? []).some((token) => hay.includes(token))
    );
  }
  if (q.includes("astoria")) return hay.includes("astoria") || hay.includes("queens");
  return true;
}

function restaurantIntentScore(location: Record<string, unknown>, query: string) {
  const hay = locationText(location);
  const mealTerms = getMealTermsFromQuery(query);
  let points = 0;
  if (n(location.source_table) === "restaurants") points += 50;
  if (location.restaurant_name) points += 30;
  if (location.cuisine || location.cuisine_type || location.food_type) points += 25;
  for (const term of mealTerms) if (hay.includes(term)) points += 40;
  if (hay.includes("steakhouse")) points += 35;
  if (hay.includes("steak")) points += 30;
  if (hay.includes("churrasco") || hay.includes("brazilian steakhouse")) points += 30;
  if (hay.includes("grill") && STEAK_TERMS.some((term) => hay.includes(term))) points += 15;
  if (hay.includes("dinner")) points += 20;
  if (hay.includes("restaurant")) points += 20;
  if (isActivityOnlyRecord(location)) points -= 100;
  return points;
}

function filterRestaurantCandidatesForQuery(locations: Record<string, unknown>[], query: string) {
  const mealIntent = hasMealIntent(query);
  const mealTerms = getMealTermsFromQuery(query);
  const restaurantCandidates = locations.filter((location) => isRestaurantRecord(location) && !isActivityOnlyRecord(location));
  if (!mealIntent) return { filtered: restaurantCandidates, strictCount: restaurantCandidates.length, fallbackCount: restaurantCandidates.length };
  const strictMealMatches = restaurantCandidates.filter((location) => {
    const hay = locationText(location);
    return mealTerms.some((term) => hay.includes(term));
  });
  const steakIntent = STEAK_TERMS.some((term) => query.toLowerCase().includes(term));
  if (steakIntent) {
    const steakStrictMatches = restaurantCandidates.filter((location) => {
      const hay = locationText(location);
      return STEAK_TERMS.some((term) => hay.includes(term)) || (hay.includes("grill") && hay.includes("steak"));
    });
    if (steakStrictMatches.length > 0) {
      return { filtered: steakStrictMatches, strictCount: steakStrictMatches.length, fallbackCount: 0 };
    }
  }
  if (strictMealMatches.length > 0) return { filtered: strictMealMatches, strictCount: strictMealMatches.length, fallbackCount: 0 };
  return { filtered: restaurantCandidates, strictCount: 0, fallbackCount: restaurantCandidates.length };
}

function filterActivityCandidatesForQuery(locations: Record<string, unknown>[], query: string) {
  const activityTerms = getActivityTermsFromQuery(query);
  return locations.filter((location) => {
    const hay = locationText(location);
    const hasActivitySignal = activityTerms.length ? activityTerms.some((term) => hay.includes(term)) : true;
    if (!hasActivitySignal) return false;
    if (isRestaurantRecord(location) && activityTerms.length > 0 && !activityTerms.some((term) => hay.includes(term))) return false;
    return true;
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
  const geoIntent = intent.geoIntent ?? detectRequestedGeo(intent.rawQuery || searchText);
  const intentQuery = `${searchText} ${(intent.locationIntent ?? []).join(" ")} ${(intent.locations ?? []).join(" ")} ${(intent.boroughs ?? []).join(" ")}`.trim();
  const rejectedRecords: Array<{ name: string; reason: string; domain?: string | null }> = [];
  const nameForDebug = (record: Record<string, unknown>) => String(record.name ?? record.restaurant_name ?? record.activity_name ?? record.business_name ?? "Unknown");
  const geoFilteredByIntent = domainRecords.filter((record) => boroughMatches(record, intent.boroughs));
  const geoFilteredByQuery = geoIntent ? domainRecords.filter((record) => locationMatchesGeo(record, geoIntent)) : domainRecords.filter((record) => matchesGeo(record, intentQuery));
  const geoFiltered = geoIntent
    ? (geoFilteredByQuery.length > 0 ? geoFilteredByQuery : geoFilteredByIntent.length > 0 ? geoFilteredByIntent : domainRecords)
    : (geoFilteredByQuery.length > 0 ? geoFilteredByQuery : geoFilteredByIntent.length > 0 ? geoFilteredByIntent : domainRecords);
  if ((geoIntent || intent.boroughs.length > 0) && geoFilteredByQuery.length === 0 && domainRecords.length > 0) {
    rejectedRecords.push(...domainRecords.slice(0, 20).map((record) => ({
      name: nameForDebug(record),
      reason: "geo_softened_no_exact_location_match",
      domain: inferRecordDomain(record),
    })));
  }
  const terms = domain === "restaurant" ? getSpecificFoodTerms(intent) : (intent.activityIntent ?? intent.activityIntents);
  let categorized: Record<string, unknown>[] = domain === "restaurant" ? [] : softCategoryFilter(geoFiltered, terms);
  let strictRestaurantCount = 0;
  let fallbackRestaurantCount = 0;
  let restaurantCandidateCount = 0;
  let activityCandidateCount = 0;

  if (domain === "restaurant") {
    const restaurantCandidates = domainRecords.filter((record) => isRestaurantRecord(record) && !isActivityOnlyRecord(record));
    restaurantCandidateCount = restaurantCandidates.length;
    const strictFoodTerms = getSpecificFoodTerms(intent);
    const hasSpecificCuisine = strictFoodTerms.length > 0 || intent.cuisines.length > 0 || Boolean(intent.requiredRestaurantCategory);
    const hardCuisineMatches = hasSpecificCuisine
      ? restaurantCandidates.filter((record) => matchesSpecificFoodIntent(record, strictFoodTerms.length ? strictFoodTerms : intent.cuisines) || scoreCuisineCategoryMatch(record, intent.rawQuery || intentQuery, true).score > 0)
      : [];
    strictRestaurantCount = hardCuisineMatches.length;

    if (geoIntent && hardCuisineMatches.length > 0) {
      const hardCuisineGeoMatches = hardCuisineMatches.filter((record) => locationMatchesGeo(record, geoIntent));
      categorized = (hardCuisineGeoMatches.length > 0 ? hardCuisineGeoMatches : hardCuisineMatches)
        .sort((a, b) => (scoreCuisineCategoryMatch(b, intent.rawQuery || intentQuery, true).score * 3 + scoreGeoMatch(b, geoIntent)) - (scoreCuisineCategoryMatch(a, intent.rawQuery || intentQuery, true).score * 3 + scoreGeoMatch(a, geoIntent)));
      fallbackRestaurantCount = hardCuisineGeoMatches.length > 0 ? 0 : hardCuisineMatches.length;
    } else {
      const sourceForGeneric = geoIntent ? geoFiltered : restaurantCandidates;
      const filtered = filterRestaurantCandidatesForQuery(sourceForGeneric, intentQuery);
      strictRestaurantCount = Math.max(strictRestaurantCount, filtered.strictCount);
      fallbackRestaurantCount = filtered.fallbackCount;
      categorized = filtered.filtered.sort((a, b) => restaurantIntentScore(b, intentQuery) - restaurantIntentScore(a, intentQuery));
      if (strictFoodTerms.length > 0 && strictRestaurantCount > 0) {
        const strictMatches = categorized.filter((record) => matchesSpecificFoodIntent(record, strictFoodTerms));
        if (strictMatches.length > 0) {
          rejectedRecords.push(...categorized.filter((record) => !matchesSpecificFoodIntent(record, strictFoodTerms)).slice(0, 20).map((record) => ({ name: nameForDebug(record), reason: `missing_specific_food:${strictFoodTerms.join("|")}`, domain: inferRecordDomain(record) })));
          categorized = strictMatches;
        }
      }
    }
  } else {
    activityCandidateCount = filterActivityCandidatesForQuery(geoFiltered, intentQuery).length;
    categorized = filterActivityCandidatesForQuery(geoFiltered, intentQuery);
    if (!hasAddOnActivityIntent(intentQuery)) categorized = softCategoryFilter(categorized, terms);
    if (intent.needsRestaurant && intent.needsActivity && (intent.addOnIntent ?? []).length > 0) {
      const addOn = (intent.addOnIntent ?? []).map((x) => x.replaceAll("_", " "));
      const addOnMatches = categorized.filter((record) => addOn.some((term) => recordSearchText(record).includes(term)));
      if (addOnMatches.length > 0) {
        rejectedRecords.push(...categorized.filter((record) => !addOn.some((term) => recordSearchText(record).includes(term))).slice(0, 20).map((record) => ({ name: nameForDebug(record), reason: `missing_activity_add_on:${addOn.join("|")}`, domain: inferRecordDomain(record) })));
        categorized = addOnMatches;
      }
    }
  }

  const debug: SearchDebug = { searchedTables: [SEARCHED_TABLE], rpcCalls: [], sourceErrors, rejectedRecords };
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

  if (process.env.NODE_ENV !== "production") {
    console.log("[search-debug]", {
      originalQuery: intent.rawQuery,
      normalizedQuery: intent.normalizedQuery,
      query: intentQuery,
      detectedCuisines: intent.cuisines,
      detectedGeoTerms: geoIntent?.terms ?? [],
      geoType: geoIntent?.geoType ?? null,
      mealTerms: getMealTermsFromQuery(intentQuery),
      activityTerms: getActivityTermsFromQuery(intentQuery),
      restaurantCandidateCount,
      strictRestaurantCount,
      fallbackRestaurantCount,
      activityCandidateCount,
      fallbackStage: domain === "restaurant" ? (strictRestaurantCount > 0 && geoIntent ? "hard_cuisine_then_geo" : fallbackRestaurantCount > 0 ? "generic_or_expanded" : "strict") : undefined,
      finalCardCount: categorized.length,
      top10: categorized.slice(0, 10).map((record) => {
        const cuisineScore = scoreCuisineCategoryMatch(record, intent.rawQuery || intentQuery, true).score;
        const geoScore = scoreGeoMatch(record, geoIntent);
        const typeScore = isRestaurantRecord(record) && !isActivityOnlyRecord(record) ? 25 : 0;
        return {
          name: record.name ?? record.restaurant_name ?? record.activity_name,
          cuisineScore,
          geoScore,
          typeScore,
          finalScore: cuisineScore * 3 + typeScore * 2 + geoScore,
          reason: domain === "restaurant" ? (cuisineScore > 0 && geoScore > 0 ? "included:hard_cuisine_geo" : cuisineScore > 0 ? "included:cuisine_geo_expanded" : "included:generic_fallback") : "included:activity_match",
        };
      }),
    });
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
