export const LOW_LEVEL_TERMS = [
  "delivery only",
  "deli",
  "delicatessen",
  "bodega",
  "grocery",
  "market",
  "mini market",
  "supermarket",
  "convenience store",
  "corner store",
  "food cart",
  "food truck",
  "halal cart",
  "fast food",
  "quick service",
  "counter service",
  "buffet",
  "pizza by the slice",
  "chinese takeout",
  "express",
  "smoke shop",
  "liquor store",
  "pharmacy",
  "gas station",
  "laundromat",
  "check cashing",
];

export const LOW_LEVEL_ALLOWED_QUERY_TERMS = [
  "takeout",
  "take out",
  "to go",
  "pickup",
  "pick up",
  "delivery",
  "deli",
  "bodega",
  "corner store",
  "cheap eats",
  "quick bite",
  "quick food",
  "fast food",
  "food truck",
  "food cart",
  "slice",
  "casual",
  "grab food",
  "grab lunch",
  "grab dinner",
  "nearby deli",
  "chinese takeout",
];

const PROTECTED_CURATION_TIERS = new Set(["premium", "curated", "date_worthy", "featured", "high_value"]);
const UNVERIFIED_SOURCE_QUALITY = new Set(["imported_unverified", "generic_restaurant", "needs_enrichment", "low_level_review"]);
const QUICK_SERVICE_GOOGLE_TYPES = new Set(["fast_food_restaurant", "food_court", "meal_delivery", "food_delivery", "pizza_delivery"]);
const TAKEAWAY_GOOGLE_TYPES = new Set(["meal_takeaway", "sandwich_shop", "hamburger_restaurant", "pizza_restaurant"]);
const DESTINATION_GOOGLE_TYPES = new Set(["fine_dining_restaurant", "steak_house", "seafood_restaurant", "sushi_restaurant", "wine_bar", "cocktail_bar", "bar", "night_club", "event_venue"]);
const GENERIC_GOOGLE_TYPES = new Set(["restaurant", "food", "point_of_interest", "establishment"]);
const DESTINATION_TERMS = ["dine in", "reservation", "reservable", "rooftop", "waterfront", "fine dining", "tasting menu", "omakase", "private dining", "live music", "jazz", "cocktail", "wine bar", "lounge", "romantic", "date night", "birthday", "celebration", "good for groups", "outdoor seating"];

function lower(value: unknown) { return String(value ?? "").toLowerCase().trim(); }
function toArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}
function readBoolean(item: any, ...keys: string[]): boolean | null {
  for (const key of keys) {
    if (item?.[key] === true) return true;
    if (item?.[key] === false) return false;
  }
  return null;
}

export function normalizeSearchText(value: unknown): string {
  if (Array.isArray(value)) return value.map(normalizeSearchText).join(" ").replace(/\s+/g, " ").trim();
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(normalizeSearchText).join(" ").replace(/\s+/g, " ").trim();
  return lower(value).replace(/[_-]/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function userExplicitlyAskedForLowLevel(input: string): boolean {
  const text = normalizeSearchText(input);
  if (!text) return false;
  return LOW_LEVEL_ALLOWED_QUERY_TERMS.some((term) => {
    const normalizedTerm = normalizeSearchText(term);
    return new RegExp(`(^|\\s)${normalizedTerm.replace(/\s+/g, "\\s+")}(\\s|$)`).test(text);
  });
}

export function hasPublicPhoto(item: any): boolean {
  if (item?.has_photos !== true) return false;
  if (lower(item?.photo_status) === "missing_photo") return false;
  if (typeof item?.main_image === "string" && item.main_image.trim()) return true;
  if (typeof item?.image_url === "string" && item.image_url.trim()) return true;
  return toArray(item?.images).length > 0 || toArray(item?.photos).length > 0;
}

export function hasStrongRestaurantQuality(item: any): boolean {
  const rating = Number(item?.rating ?? item?.google_rating ?? 0);
  const reviewCount = Number(item?.review_count ?? item?.google_user_rating_count ?? 0);
  return hasPublicPhoto(item) && rating >= 4 && reviewCount >= 25;
}

export const WELLNESS_ACTIVITY_TERMS = ["spa", "massage", "wellness", "head spa", "float spa", "yoga spa", "recovery spa"];

function isOperationalPublicRecord(item: any): boolean {
  const status = lower(item?.status);
  const dataStatus = lower(item?.data_status);
  const duplicateStatus = lower(item?.duplicate_status);
  const publicVisibilityTier = lower(item?.public_visibility_tier);
  return item?.is_hidden !== true && publicVisibilityTier !== "hidden" && !["hidden", "deleted", "archived"].includes(dataStatus) && !["closed", "deleted", "archived", "hidden"].includes(status) && duplicateStatus !== "duplicate";
}

function combinedItemText(item: any): string {
  return normalizeSearchText([item?.name,item?.restaurant_name,item?.activity_name,item?.location_type,item?.primary_category,item?.category,item?.cuisine,item?.cuisine_type,item?.food_type,item?.activity_type,item?.description,item?.search_document,item?.source,item?.source_table,item?.import_source,item?.low_level_reason,item?.tags,item?.semantic_tags,item?.vibe_tags,item?.best_for_tags,item?.google_types,item?.google_primary_type,item?.search_keywords]);
}

export function isWellnessActivity(item: any): boolean {
  const text = combinedItemText(item);
  const locationType = lower(item?.location_type);
  const activityFields = normalizeSearchText([item?.activity_name,item?.activity_type,item?.primary_category,item?.category,item?.tags,item?.google_types,item?.search_keywords]);
  const hasWellnessTerm = WELLNESS_ACTIVITY_TERMS.some((term) => text.includes(normalizeSearchText(term)));
  if (!hasWellnessTerm) return false;
  return locationType === "activity" || Boolean(item?.activity_name || item?.activity_type) || WELLNESS_ACTIVITY_TERMS.some((term) => activityFields.includes(normalizeSearchText(term)));
}

export function isQualifiedWellnessActivity(item: any): boolean {
  return isWellnessActivity(item) && isOperationalPublicRecord(item) && hasStrongRestaurantQuality(item);
}

function isProtected(item: any): boolean {
  return PROTECTED_CURATION_TIERS.has(lower(item?.curation_tier)) || ["premium", "curated"].includes(lower(item?.public_visibility_tier));
}
function isRestaurant(item: any): boolean { return lower(item?.location_type) === "restaurant" || Boolean(item?.restaurant_name); }
function hasDineInEvidence(item: any): boolean {
  if (readBoolean(item, "dineIn", "dine_in", "google_dine_in") === true) return true;
  return /(^|\s)dine\s+in(\s|$)/.test(combinedItemText(item));
}
function hasDestinationEvidence(item: any): boolean {
  if (isProtected(item)) return true;
  if (readBoolean(item, "reservable", "google_reservable") === true) return true;
  if (readBoolean(item, "goodForGroups", "good_for_groups", "group_friendly") === true) return true;
  if (readBoolean(item, "outdoorSeating", "outdoor_seating") === true) return true;
  if (readBoolean(item, "liveMusic", "live_music") === true) return true;
  if (readBoolean(item, "servesCocktails", "serves_cocktails") === true) return true;
  if (readBoolean(item, "servesWine", "serves_wine") === true) return true;
  for (const key of ["reservation_url", "reservation_link", "reservation_external_url", "external_reservation_url", "reservation_provider_url"]) {
    if (typeof item?.[key] === "string" && item[key].trim()) return true;
  }
  const googleTypes = toArray(item?.google_types).map(lower);
  if (googleTypes.some((type) => DESTINATION_GOOGLE_TYPES.has(type))) return true;
  const text = combinedItemText(item);
  return DESTINATION_TERMS.some((term) => text.includes(normalizeSearchText(term)));
}
function hasOnlyGenericGoogleRestaurantTypes(item: any): boolean {
  const types = toArray(item?.google_types).map(lower).filter(Boolean);
  return types.length > 0 && types.includes("restaurant") && types.every((type) => GENERIC_GOOGLE_TYPES.has(type));
}

export function isStorefrontTakeoutRestaurant(item: any): boolean {
  if (!isRestaurant(item) || isProtected(item)) return false;
  const dineIn = readBoolean(item, "dineIn", "dine_in", "google_dine_in");
  const takeout = readBoolean(item, "takeout", "google_takeout");
  const delivery = readBoolean(item, "delivery", "google_delivery");
  const curbside = readBoolean(item, "curbsidePickup", "curbside_pickup", "google_curbside_pickup");
  const types = toArray(item?.google_types).map(lower);
  const destination = hasDestinationEvidence(item);
  if (dineIn === false && (takeout === true || delivery === true || curbside === true) && !destination) return true;
  if (types.some((type) => QUICK_SERVICE_GOOGLE_TYPES.has(type)) && !destination) return true;
  if (types.some((type) => TAKEAWAY_GOOGLE_TYPES.has(type)) && !hasDineInEvidence(item) && !destination) return true;
  const text = combinedItemText(item);
  const serviceText = /(^|\s)(takeout|take out|takeaway|carryout|pickup|to go)(\s|$)/.test(text);
  return serviceText && !hasDineInEvidence(item) && !destination;
}

export function isWeakGenericRestaurant(item: any): boolean {
  if (!isRestaurant(item) || isProtected(item) || !hasOnlyGenericGoogleRestaurantTypes(item)) return false;
  if (hasDineInEvidence(item) || hasDestinationEvidence(item)) return false;
  const rating = Number(item?.rating ?? item?.google_rating ?? 0);
  const reviews = Number(item?.review_count ?? item?.google_user_rating_count ?? 0);
  return Number.isFinite(rating) && Number.isFinite(reviews) && rating > 0 && rating < 4.2 && reviews >= 25;
}

export function isQuickBiteSearchCandidate(item: any): boolean {
  return isStorefrontTakeoutRestaurant(item) || isWeakGenericRestaurant(item);
}

function hasLowLevelTermSignal(item: any): boolean {
  const itemText = combinedItemText(item);
  return LOW_LEVEL_TERMS.some((term) => itemText.includes(normalizeSearchText(term)));
}

export function isUnverifiedNycRestaurant(item: any): boolean {
  const sourceText = normalizeSearchText([item?.source, item?.source_table, item?.import_source]);
  const sourceIsNyc = /(^|\s)(nyc|opendata|dohmh|doh|inspection|sidewalk|permits)(\s|$)|open data|public data|nyc open data|nyc restaurant|restaurant inspection/.test(sourceText);
  return sourceIsNyc && lower(item?.location_type) === "restaurant" && !isProtected(item) && (!hasPublicPhoto(item) || item?.rating == null || item?.review_count == null);
}

export function isLowLevelLocation(item: any): boolean {
  if (!item) return false;
  if (isQualifiedWellnessActivity(item)) return false;
  if (item.is_low_level === true) return true;
  if (lower(item.curation_tier) === "low_level") return true;
  if (["low_level", "hidden"].includes(lower(item.public_visibility_tier))) return true;
  if (UNVERIFIED_SOURCE_QUALITY.has(lower(item.source_quality_status))) return true;
  if (lower(item.import_confidence) === "low") return true;
  if (hasLowLevelTermSignal(item)) return true;
  if (!hasPublicPhoto(item)) return true;
  return isUnverifiedNycRestaurant(item);
}

function exactLowLevelIntentMatches(item: any, input: string): boolean {
  const query = normalizeSearchText(input);
  const itemText = combinedItemText(item);
  return LOW_LEVEL_ALLOWED_QUERY_TERMS.some((term) => {
    const normalized = normalizeSearchText(term);
    return query.includes(normalized) && itemText.includes(normalized.split(" ")[0]);
  });
}

export function applyLowLevelPenalty(score: number, item: any, input: string): number {
  const allowQuickBite = userExplicitlyAskedForLowLevel(input);
  let adjusted = score;
  if (!allowQuickBite) {
    if (isQuickBiteSearchCandidate(item)) adjusted -= 900;
    if (isLowLevelLocation(item)) adjusted -= 1000;
    if (isUnverifiedNycRestaurant(item)) adjusted -= 1200;
    if (!hasPublicPhoto(item)) adjusted -= 800;
    if (lower(item?.source_quality_status) === "imported_unverified") adjusted -= 700;
    if (["hidden", "low_level"].includes(lower(item?.public_visibility_tier))) adjusted -= 700;
    return adjusted;
  }
  if (isQuickBiteSearchCandidate(item)) adjusted += 175;
  if (!hasPublicPhoto(item)) adjusted -= 300;
  if (exactLowLevelIntentMatches(item, input)) adjusted += 200;
  return adjusted;
}
