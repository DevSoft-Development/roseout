import type { EnterpriseSearchResult } from "@/lib/search/enterprise/types";
import {
  isQuickBiteSearchCandidate,
  normalizeSearchText,
  userExplicitlyAskedForLowLevel,
} from "@/lib/search/lowLevel";

const LOW_LEVEL_RESTAURANT_IDENTITIES = [
  "deli",
  "delicatessen",
  "bodega",
  "grocery",
  "supermarket",
  "convenience store",
  "corner store",
  "food cart",
  "food truck",
  "halal cart",
  "fast food",
  "quick service",
  "counter service",
  "pizza by the slice",
  "chinese takeout",
];

function locationId(item: any): string | null {
  const value = item?.id ?? item?.location_id ?? item?.source_id ?? null;
  return value == null ? null : String(value);
}

function isRestaurantLike(item: any): boolean {
  const locationType = String(item?.location_type ?? item?.type ?? "").toLowerCase();
  return locationType === "restaurant" || Boolean(item?.restaurant_name);
}

function hasExplicitLowLevelRestaurantIdentity(item: any): boolean {
  if (!item) return false;
  if (item?.is_low_level === true) return true;
  if (String(item?.quality_status ?? "").toLowerCase() === "low_level_review") return true;
  if (String(item?.curation_tier ?? "").toLowerCase() === "low_level") return true;
  if (String(item?.public_visibility_tier ?? "").toLowerCase() === "low_level") return true;

  const text = normalizeSearchText([
    item?.name,
    item?.restaurant_name,
    item?.primary_category,
    item?.category,
    item?.google_primary_type,
    item?.google_types,
    item?.tags,
    item?.search_keywords,
  ]);
  return LOW_LEVEL_RESTAURANT_IDENTITIES.some((term) => text.includes(normalizeSearchText(term)));
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function seasonalText(item: any): string {
  const values = [
    item?.name,
    item?.restaurant_name,
    item?.description,
    item?.search_keywords,
    item?.tags,
  ];
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .map(String)
    .join(" ");
}

function explicitSeasonRange(item: any): { start: number; end: number } | null {
  const text = seasonalText(item);
  if (!text) return null;
  const month = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const match = new RegExp(`\\b${month}\\s*(?:-|–|—|through|thru|to)\\s*${month}\\b(?:\\s+only)?`, "i").exec(text);
  if (!match) return null;
  const start = MONTH_INDEX[match[1].toLowerCase()];
  const end = MONTH_INDEX[match[2].toLowerCase()];
  return start && end ? { start, end } : null;
}

function monthInRange(month: number, start: number, end: number): boolean {
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}

function isOutOfSeason(item: any, now: Date): boolean {
  const range = explicitSeasonRange(item);
  if (!range) return false;
  return !monthInRange(now.getMonth() + 1, range.start, range.end);
}

function restaurantEligible(item: any, query: string, now: Date): boolean {
  if (!item) return true;
  if (isOutOfSeason(item, now)) return false;
  if (userExplicitlyAskedForLowLevel(query)) return true;
  return !hasExplicitLowLevelRestaurantIdentity(item) && !isQuickBiteSearchCandidate(item);
}

function pairRestaurant(pair: any) {
  return pair?.restaurant ?? pair?.restaurant_location ?? pair?.first_restaurant ?? null;
}

function pairRestaurantId(pair: any): string | null {
  const nested = locationId(pairRestaurant(pair));
  if (nested) return nested;
  const value =
    pair?.restaurant_location_id ??
    pair?.restaurant_id ??
    pair?.restaurant?.location_id ??
    pair?.restaurant?.id ??
    null;
  return value == null ? null : String(value);
}

function filterRestaurantArray(items: any[], query: string, now: Date) {
  return items.filter((item) => !isRestaurantLike(item) || restaurantEligible(item, query, now));
}

function filterPairs(items: any[], query: string, excludedRestaurantIds: Set<string>, now: Date) {
  return items.filter((pair) => {
    const nested = pairRestaurant(pair);
    if (nested && !restaurantEligible(nested, query, now)) return false;
    const id = pairRestaurantId(pair);
    return !id || !excludedRestaurantIds.has(id);
  });
}

function filterCards(items: any[], query: string, excludedRestaurantIds: Set<string>, now: Date) {
  return items.filter((item) => {
    if (pairRestaurant(item)) {
      const nested = pairRestaurant(item);
      if (nested && !restaurantEligible(nested, query, now)) return false;
      const id = pairRestaurantId(item);
      return !id || !excludedRestaurantIds.has(id);
    }
    if (!isRestaurantLike(item)) return true;
    const id = locationId(item);
    if (id && excludedRestaurantIds.has(id)) return false;
    return restaurantEligible(item, query, now);
  });
}

export function applyFinalRestaurantEligibility(
  result: EnterpriseSearchResult,
  query: string,
  now: Date = new Date(),
): EnterpriseSearchResult {
  if (!result) return result;

  const raw = result as any;
  const originalRestaurants = Array.isArray(raw.restaurants) ? raw.restaurants : [];
  const restaurants = filterRestaurantArray(originalRestaurants, query, now);
  const allowedRestaurantIds = new Set<string>(
    restaurants.map(locationId).filter((id: string | null): id is string => id !== null),
  );
  const excludedRestaurantIds = new Set<string>(
    originalRestaurants
      .map(locationId)
      .filter((id: string | null): id is string => id !== null && !allowedRestaurantIds.has(id)),
  );

  const pairs = filterPairs(Array.isArray(raw.pairs) ? raw.pairs : [], query, excludedRestaurantIds, now);
  const matchedLocations = filterRestaurantArray(
    Array.isArray(raw.matched_locations)
      ? raw.matched_locations
      : Array.isArray(raw.matchedLocations)
        ? raw.matchedLocations
        : [],
    query,
    now,
  );
  const cards = filterCards(Array.isArray(raw.cards) ? raw.cards : [], query, excludedRestaurantIds, now);
  const builderRestaurants = filterRestaurantArray(
    Array.isArray(raw.builder_restaurants)
      ? raw.builder_restaurants
      : Array.isArray(raw.builder?.restaurants)
        ? raw.builder.restaurants
        : [],
    query,
    now,
  );
  const sameVenueResults = filterRestaurantArray(
    Array.isArray(raw.sameVenueResults)
      ? raw.sameVenueResults
      : Array.isArray(raw.same_venue_results)
        ? raw.same_venue_results
        : [],
    query,
    now,
  );

  const nextBuilder = raw.builder
    ? { ...raw.builder, restaurants: builderRestaurants }
    : raw.builder;
  const nestedSearchV2 = raw.searchV2 && raw.searchV2 !== raw
    ? applyFinalRestaurantEligibility(raw.searchV2 as EnterpriseSearchResult, query, now)
    : raw.searchV2;

  return {
    ...raw,
    restaurants,
    pairs,
    matched_locations: matchedLocations,
    matchedLocations,
    cards,
    builder: nextBuilder,
    builder_restaurants: builderRestaurants,
    sameVenueResults,
    same_venue_results: sameVenueResults,
    searchV2: nestedSearchV2,
    restaurant_count: restaurants.length,
    restaurantCount: restaurants.length,
    pair_count: pairs.length,
    pairCount: pairs.length,
    result_count: cards.length || pairs.length || restaurants.length + (raw.activities?.length ?? 0),
    card_counts: raw.card_counts
      ? {
          ...raw.card_counts,
          restaurants: restaurants.length,
          pairs: pairs.length,
          cards: cards.length,
          builder_restaurants: builderRestaurants.length,
          matched_locations: matchedLocations.length,
          same_venue: sameVenueResults.length,
        }
      : raw.card_counts,
    cardCounts: raw.cardCounts
      ? {
          ...raw.cardCounts,
          restaurants: restaurants.length,
          pairs: pairs.length,
          cards: cards.length,
          builderRestaurants: builderRestaurants.length,
          matched_locations: matchedLocations.length,
          sameVenue: sameVenueResults.length,
        }
      : raw.cardCounts,
    debug: {
      ...(raw.debug ?? {}),
      finalRestaurantEligibilityRejectedCount: originalRestaurants.length - restaurants.length,
      finalRestaurantEligibilityNestedV2Sanitized: Boolean(raw.searchV2),
    },
  } as EnterpriseSearchResult;
}
