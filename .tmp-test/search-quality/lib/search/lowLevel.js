"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WELLNESS_ACTIVITY_TERMS = exports.LOW_LEVEL_ALLOWED_QUERY_TERMS = exports.LOW_LEVEL_TERMS = void 0;
exports.normalizeSearchText = normalizeSearchText;
exports.userExplicitlyAskedForLowLevel = userExplicitlyAskedForLowLevel;
exports.hasPublicPhoto = hasPublicPhoto;
exports.hasStrongRestaurantQuality = hasStrongRestaurantQuality;
exports.isWellnessActivity = isWellnessActivity;
exports.isQualifiedWellnessActivity = isQualifiedWellnessActivity;
exports.isUnverifiedNycRestaurant = isUnverifiedNycRestaurant;
exports.isLowLevelLocation = isLowLevelLocation;
exports.applyLowLevelPenalty = applyLowLevelPenalty;
exports.LOW_LEVEL_TERMS = [
    "takeout",
    "take out",
    "take-away",
    "takeaway",
    "carryout",
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
exports.LOW_LEVEL_ALLOWED_QUERY_TERMS = [
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
    "fast food",
    "food truck",
    "food cart",
    "slice",
    "casual",
    "grab food",
    "grab lunch",
    "nearby deli",
    "chinese takeout",
];
const PROTECTED_CURATION_TIERS = new Set([
    "premium",
    "curated",
    "date_worthy",
    "featured",
    "high_value",
]);
const UNVERIFIED_SOURCE_QUALITY = new Set([
    "imported_unverified",
    "generic_restaurant",
    "needs_enrichment",
    "low_level_review",
]);
function lower(value) {
    return String(value ?? "").toLowerCase().trim();
}
function toArray(value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value.map(String).filter(Boolean);
    if (typeof value === "string")
        return value.split(",").map((item) => item.trim()).filter(Boolean);
    return [];
}
function normalizeSearchText(value) {
    if (Array.isArray(value))
        return value.map(normalizeSearchText).join(" ").replace(/\s+/g, " ").trim();
    if (value && typeof value === "object")
        return Object.values(value).map(normalizeSearchText).join(" ").replace(/\s+/g, " ").trim();
    return lower(value).replace(/[_-]/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function userExplicitlyAskedForLowLevel(input) {
    const text = normalizeSearchText(input);
    if (!text)
        return false;
    return exports.LOW_LEVEL_ALLOWED_QUERY_TERMS.some((term) => {
        const normalizedTerm = normalizeSearchText(term);
        return new RegExp(`(^|\\s)${normalizedTerm.replace(/\s+/g, "\\s+")}(\\s|$)`).test(text);
    });
}
function hasPublicPhoto(item) {
    if (item?.has_photos !== true)
        return false;
    if (lower(item?.photo_status) === "missing_photo")
        return false;
    if (typeof item?.main_image === "string" && item.main_image.trim())
        return true;
    if (typeof item?.image_url === "string" && item.image_url.trim())
        return true;
    return toArray(item?.images).length > 0 || toArray(item?.photos).length > 0;
}
function hasStrongRestaurantQuality(item) {
    const rating = Number(item?.rating ?? 0);
    const reviewCount = Number(item?.review_count ?? 0);
    return hasPublicPhoto(item) && rating >= 4 && reviewCount >= 25;
}
exports.WELLNESS_ACTIVITY_TERMS = [
    "spa",
    "massage",
    "wellness",
    "head spa",
    "float spa",
    "yoga spa",
    "recovery spa",
];
function isOperationalPublicRecord(item) {
    const status = lower(item?.status);
    const dataStatus = lower(item?.data_status);
    const duplicateStatus = lower(item?.duplicate_status);
    const publicVisibilityTier = lower(item?.public_visibility_tier);
    return (item?.is_hidden !== true &&
        publicVisibilityTier !== "hidden" &&
        !["hidden", "deleted", "archived"].includes(dataStatus) &&
        !["closed", "deleted", "archived", "hidden"].includes(status) &&
        duplicateStatus !== "duplicate");
}
function isWellnessActivity(item) {
    const text = combinedItemText(item);
    const locationType = lower(item?.location_type);
    const activityFields = normalizeSearchText([
        item?.activity_name,
        item?.activity_type,
        item?.primary_category,
        item?.category,
        item?.tags,
        item?.google_types,
        item?.search_keywords,
    ]);
    const hasWellnessTerm = exports.WELLNESS_ACTIVITY_TERMS.some((term) => text.includes(normalizeSearchText(term)));
    if (!hasWellnessTerm)
        return false;
    return (locationType === "activity" ||
        Boolean(item?.activity_name || item?.activity_type) ||
        exports.WELLNESS_ACTIVITY_TERMS.some((term) => activityFields.includes(normalizeSearchText(term))));
}
function isQualifiedWellnessActivity(item) {
    return (isWellnessActivity(item) &&
        isOperationalPublicRecord(item) &&
        hasStrongRestaurantQuality(item));
}
function combinedItemText(item) {
    return normalizeSearchText([
        item?.name,
        item?.restaurant_name,
        item?.activity_name,
        item?.location_type,
        item?.primary_category,
        item?.category,
        item?.cuisine,
        item?.cuisine_type,
        item?.food_type,
        item?.activity_type,
        item?.description,
        item?.search_document,
        item?.source,
        item?.source_table,
        item?.import_source,
        item?.low_level_reason,
        item?.tags,
        item?.google_types,
        item?.search_keywords,
    ]);
}
function isProtected(item) {
    return PROTECTED_CURATION_TIERS.has(lower(item?.curation_tier)) || ["premium", "curated"].includes(lower(item?.public_visibility_tier));
}
function isUnverifiedNycRestaurant(item) {
    const sourceText = normalizeSearchText([item?.source, item?.source_table, item?.import_source]);
    const sourceIsNyc = /(^|\s)(nyc|opendata|dohmh|doh|inspection|sidewalk|permits)(\s|$)|open data|public data|nyc open data|nyc restaurant|restaurant inspection/.test(sourceText);
    return sourceIsNyc && lower(item?.location_type) === "restaurant" && !isProtected(item) && (!hasPublicPhoto(item) || item?.rating == null || item?.review_count == null);
}
function isLowLevelLocation(item) {
    if (!item)
        return false;
    if (isQualifiedWellnessActivity(item))
        return false;
    if (item.is_low_level === true)
        return true;
    if (lower(item.curation_tier) === "low_level")
        return true;
    if (["low_level", "hidden"].includes(lower(item.public_visibility_tier)))
        return true;
    if (UNVERIFIED_SOURCE_QUALITY.has(lower(item.source_quality_status)))
        return true;
    if (lower(item.import_confidence) === "low")
        return true;
    if (exports.LOW_LEVEL_TERMS.some((term) => combinedItemText(item).includes(normalizeSearchText(term))))
        return true;
    if (!hasPublicPhoto(item))
        return true;
    return isUnverifiedNycRestaurant(item);
}
function exactLowLevelIntentMatches(item, input) {
    const query = normalizeSearchText(input);
    const itemText = combinedItemText(item);
    return exports.LOW_LEVEL_ALLOWED_QUERY_TERMS.some((term) => {
        const normalized = normalizeSearchText(term);
        return query.includes(normalized) && itemText.includes(normalized.split(" ")[0]);
    });
}
function applyLowLevelPenalty(score, item, input) {
    const allow = userExplicitlyAskedForLowLevel(input);
    let adjusted = score;
    if (!allow) {
        if (isLowLevelLocation(item))
            adjusted -= 1000;
        if (isUnverifiedNycRestaurant(item))
            adjusted -= 1200;
        if (!hasPublicPhoto(item))
            adjusted -= 800;
        if (lower(item?.source_quality_status) === "imported_unverified")
            adjusted -= 700;
        if (["hidden", "low_level"].includes(lower(item?.public_visibility_tier)))
            adjusted -= 700;
        return adjusted;
    }
    if (!hasPublicPhoto(item))
        adjusted -= 300;
    if (exactLowLevelIntentMatches(item, input))
        adjusted += 200;
    return adjusted;
}
