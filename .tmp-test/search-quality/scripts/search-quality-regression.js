"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const pairing_1 = require("../lib/search/enterprise/pairing");
const normalize_intent_1 = require("../lib/search/enterprise/normalize-intent");
const ranking_1 = require("../lib/search/enterprise/ranking");
const lowLevel_1 = require("../lib/search/lowLevel");
const records = [
    { id: "r1", name: "Astoria Prime", restaurant_name: "Astoria Prime", location_type: "restaurant", cuisine: "Steakhouse", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", latitude: 40.764, longitude: -73.923, rating: 4.7, search_document: "steakhouse steak dinner restaurant Astoria" },
    { id: "r2", name: "Brooklyn Steak", restaurant_name: "Brooklyn Steak", location_type: "restaurant", cuisine: "Steakhouse", borough: "Brooklyn", city: "New York", state: "NY", latitude: 40.681, longitude: -73.946, rating: 4.6, search_document: "steakhouse steak dinner restaurant Brooklyn" },
    { id: "r3", name: "Astoria Seafood", restaurant_name: "Astoria Seafood", location_type: "restaurant", cuisine: "Seafood", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", latitude: 40.763, longitude: -73.921, rating: 4.2, search_document: "seafood dinner restaurant Astoria" },
    { id: "r4", name: "LIC Rooftop", restaurant_name: "LIC Rooftop", location_type: "restaurant", cuisine: "American", neighborhood: "Long Island City", borough: "Queens", city: "New York", state: "NY", latitude: 40.744, longitude: -73.956, rating: 4.4, search_document: "rooftop dinner terrace skyline restaurant Long Island City" },
    { id: "r5", name: "Manhattan Sushi", restaurant_name: "Manhattan Sushi", location_type: "restaurant", cuisine: "Sushi", borough: "Manhattan", city: "New York", state: "NY", latitude: 40.758, longitude: -73.985, rating: 4.8, search_document: "sushi omakase japanese dinner Manhattan" },
    { id: "r6", name: "Nassau Italian", restaurant_name: "Nassau Italian", location_type: "restaurant", cuisine: "Italian", county: "Nassau County", region: "Long Island", city: "Garden City", state: "NY", latitude: 40.726, longitude: -73.634, search_document: "italian pasta restaurant Nassau County Long Island" },
    { id: "r7", name: "Brooklyn Crab House", restaurant_name: "Brooklyn Crab House", location_type: "restaurant", cuisine: "Seafood", borough: "Brooklyn", city: "New York", state: "NY", latitude: 40.682, longitude: -73.945, search_document: "seafood crab dinner Brooklyn" },
    { id: "r8", name: "Museum Brunch", restaurant_name: "Museum Brunch", location_type: "restaurant", cuisine: "Cafe", borough: "Manhattan", city: "New York", state: "NY", latitude: 40.778, longitude: -73.962, search_document: "brunch cafe breakfast near museum Manhattan" },
    { id: "r9", name: "Stamford Steakhouse", restaurant_name: "Stamford Steakhouse", location_type: "restaurant", cuisine: "Steakhouse", city: "Stamford", state: "CT", latitude: 41.053, longitude: -73.538, search_document: "romantic steakhouse Stamford CT" },
    { id: "r10", name: "Brooklyn Brunch", restaurant_name: "Brooklyn Brunch", location_type: "restaurant", cuisine: "Cafe", borough: "Brooklyn", city: "New York", state: "NY", latitude: 40.681, longitude: -73.946, search_document: "brunch cafe breakfast Brooklyn" },
    { id: "a1", name: "Astoria Bowl", activity_name: "Astoria Bowl", location_type: "activity", activity_type: "Bowling", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", latitude: 40.764, longitude: -73.915, rating: 4.1, search_document: "bowling lanes bowling alley games Astoria" },
    { id: "a2", name: "Far Queens Lanes", activity_name: "Far Queens Lanes", location_type: "activity", activity_type: "Bowling", neighborhood: "Flushing", borough: "Queens", city: "New York", state: "NY", latitude: 40.761, longitude: -73.830, search_document: "bowling lanes" },
    { id: "a3", name: "Manhattan Karaoke", activity_name: "Manhattan Karaoke", location_type: "activity", activity_type: "Karaoke", borough: "Manhattan", city: "New York", state: "NY", latitude: 40.759, longitude: -73.986, search_document: "karaoke rooms" },
    { id: "a4", name: "Brooklyn Live Music Hall", activity_name: "Brooklyn Live Music Hall", location_type: "activity", activity_type: "Live Music", borough: "Brooklyn", city: "New York", state: "NY", latitude: 40.681, longitude: -73.946, search_document: "live music concert jazz" },
    { id: "a5", name: "Met Museum", activity_name: "Met Museum", location_type: "activity", activity_type: "Museum", borough: "Manhattan", city: "New York", state: "NY", latitude: 40.779, longitude: -73.963, search_document: "museum art exhibit" },
    { id: "a6", name: "Astoria Hookah Lounge", activity_name: "Astoria Hookah Lounge", location_type: "activity", activity_type: "Hookah Lounge", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", latitude: 40.764, longitude: -73.924, search_document: "hookah lounge nightlife" },
    { id: "a7", name: "Jersey City Rooftop Lounge", activity_name: "Jersey City Rooftop Lounge", location_type: "activity", activity_type: "Rooftop Lounge", city: "Jersey City", state: "NJ", latitude: 40.718, longitude: -74.043, search_document: "best rooftop lounge nightlife skyline" },
    { id: "a8", name: "Brooklyn Museum", activity_name: "Brooklyn Museum", location_type: "activity", activity_type: "Museum", borough: "Brooklyn", city: "New York", state: "NY", latitude: 40.671, longitude: -73.963, search_document: "museum art exhibit Brooklyn" },
    { id: "a9", name: "Coordinate-Free Bowling", activity_name: "Coordinate-Free Bowling", location_type: "activity", activity_type: "Bowling", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", search_document: "bowling lanes Astoria" },
    { id: "a10", name: "Queens Head Spa", activity_name: "Queens Head Spa", location_type: "activity", activity_type: "Head Spa", primary_category: "Spa", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", latitude: 40.764, longitude: -73.920, rating: 4.8, review_count: 80, has_photos: true, main_image: "https://example.com/head-spa.jpg", public_visibility_tier: "low_level", curation_tier: "low_level", source_quality_status: "low_level_review", import_confidence: "low", search_document: "head spa massage wellness self care spa day Queens" },
    { id: "a11", name: "Jersey City Rooftop Recovery Spa", activity_name: "Jersey City Rooftop Recovery Spa", location_type: "activity", activity_type: "Recovery Spa", primary_category: "Spa", city: "Jersey City", state: "NJ", latitude: 40.718, longitude: -74.044, rating: 4.9, review_count: 120, has_photos: true, main_image: "https://example.com/recovery-spa.jpg", search_document: "rooftop recovery spa wellness skyline" },
];
function restaurants(q) { const i = (0, normalize_intent_1.normalizeIntent)(q); return (0, ranking_1.rankRestaurantResults)(records, i); }
function activities(q) { const i = (0, normalize_intent_1.normalizeIntent)(q); return (0, ranking_1.rankActivityResults)(records, i); }
function assertNoCross(q) { const i = (0, normalize_intent_1.normalizeIntent)(q); const rt = (0, normalize_intent_1.restaurantSearchTerms)(i); const at = (0, normalize_intent_1.activitySearchTerms)(i); for (const t of ["bowling", "lanes", "karaoke", "museum", "hookah", "live music", "walking distance", "walking", "walkable", "nearby"])
    (0, strict_1.default)(!rt.includes(t), `${q}: restaurant lane contains activity/distance term ${t}`); for (const t of ["steak", "steakhouse", "dinner", "sushi", "seafood", "italian", "brunch", "walking distance", "walking", "walkable", "nearby"])
    (0, strict_1.default)(!at.includes(t), `${q}: activity lane contains food/distance term ${t}`); }
let i = (0, normalize_intent_1.normalizeIntent)("steak dinner with bowling in Astoria");
(0, strict_1.default)(["mixed_outing", "same_location_combo"].includes(i.searchType));
(0, strict_1.default)(i.needsRestaurant);
(0, strict_1.default)((0, normalize_intent_1.restaurantSearchTerms)(i).includes("steakhouse"));
(0, strict_1.default)((0, normalize_intent_1.activitySearchTerms)(i).includes("bowling"));
strict_1.default.equal(i.geo.neighborhood, "Astoria");
strict_1.default.equal(i.geo.borough, "Queens");
(0, strict_1.default)(i.geo.latitude && i.geo.longitude);
assertNoCross(i.rawQuery);
let rr = (0, ranking_1.rankRestaurantResults)(records, i), aa = (0, ranking_1.rankActivityResults)(records, i);
strict_1.default.equal(rr[0].id, "r1");
strict_1.default.equal(aa[0].id, "a1");
let pairs = (0, pairing_1.createSearchPairs)(rr, aa, i);
(0, strict_1.default)(pairs[0].distance_miles != null);
i = (0, normalize_intent_1.normalizeIntent)("steak dinner in Astoria");
strict_1.default.equal(i.searchType, "restaurant");
rr = restaurants(i.rawQuery);
(0, strict_1.default)(rr.every(r => String(r.search_document).includes("steak") || String(r.cuisine).toLowerCase().includes("steak")));
strict_1.default.equal(rr[0].id, "r1");
(0, strict_1.default)(rr.findIndex(r => r.id === "r1") < rr.findIndex(r => r.id === "r2"));
i = (0, normalize_intent_1.normalizeIntent)("bowling in Astoria");
strict_1.default.equal(i.searchType, "activity");
aa = activities(i.rawQuery);
(0, strict_1.default)(aa.every(a => /bowling|lanes/i.test(String(a.search_document) + String(a.activity_type))));
strict_1.default.equal(aa[0].id, "a1");
i = (0, normalize_intent_1.normalizeIntent)("rooftop dinner in Long Island City");
strict_1.default.equal(i.searchType, "restaurant");
strict_1.default.equal(i.geo.neighborhood, "Long Island City");
strict_1.default.equal(i.geo.borough, "Queens");
rr = restaurants(i.rawQuery);
strict_1.default.equal(rr[0].id, "r4");
i = (0, normalize_intent_1.normalizeIntent)("rooftop dinner with bowling in LIC");
(0, strict_1.default)(["mixed_outing", "same_location_combo"].includes(i.searchType));
strict_1.default.equal(i.geo.neighborhood, "Long Island City");
pairs = (0, pairing_1.createSearchPairs)((0, ranking_1.rankRestaurantResults)(records, i), (0, ranking_1.rankActivityResults)(records, i), i);
(0, strict_1.default)(pairs[0].distance_miles != null);
i = (0, normalize_intent_1.normalizeIntent)("sushi then karaoke in Manhattan");
(0, strict_1.default)(["mixed_outing", "same_location_combo"].includes(i.searchType));
strict_1.default.equal(i.geo.borough, "Manhattan");
strict_1.default.equal(restaurants(i.rawQuery)[0].id, "r5");
strict_1.default.equal(activities(i.rawQuery)[0].id, "a3");
i = (0, normalize_intent_1.normalizeIntent)("things to do in Queens");
strict_1.default.equal(i.searchType, "activity");
aa = activities(i.rawQuery);
(0, strict_1.default)(aa.length > 0);
(0, strict_1.default)(!aa.some(a => a.restaurant_name));
i = (0, normalize_intent_1.normalizeIntent)("Italian restaurant in Nassau");
strict_1.default.equal(i.searchType, "restaurant");
strict_1.default.equal(i.geo.county, "Nassau County");
strict_1.default.equal(i.geo.region, "Long Island");
strict_1.default.notEqual(i.geo.neighborhood, "Long Island City");
strict_1.default.equal(restaurants(i.rawQuery)[0].id, "r6");
i = (0, normalize_intent_1.normalizeIntent)("date night in Hoboken");
strict_1.default.equal(i.geo.city, "Hoboken");
strict_1.default.equal(i.geo.state, "NJ");
i = (0, normalize_intent_1.normalizeIntent)("seafood and live music in Brooklyn");
strict_1.default.equal(restaurants(i.rawQuery)[0].id, "r7");
strict_1.default.equal(activities(i.rawQuery)[0].id, "a4");
i = (0, normalize_intent_1.normalizeIntent)("brunch with museum in Manhattan");
strict_1.default.equal(restaurants(i.rawQuery)[0].id, "r8");
strict_1.default.equal(activities(i.rawQuery)[0].id, "a5");
i = (0, normalize_intent_1.normalizeIntent)("hookah in Astoria");
strict_1.default.equal(i.searchType, "activity");
strict_1.default.equal(activities(i.rawQuery)[0].id, "a6");
i = (0, normalize_intent_1.normalizeIntent)("dinner with hookah in Queens");
(0, strict_1.default)(i.needsRestaurant);
i = (0, normalize_intent_1.normalizeIntent)("best rooftop lounge in Jersey City");
strict_1.default.equal(i.searchType, "activity");
strict_1.default.equal(i.geo.city, "Jersey City");
strict_1.default.equal(i.geo.state, "NJ");
strict_1.default.equal(activities(i.rawQuery)[0].id, "a7");
i = (0, normalize_intent_1.normalizeIntent)("spa day for self-care in Queens");
strict_1.default.equal(i.searchType, "activity");
aa = activities(i.rawQuery);
strict_1.default.equal(aa[0].id, "a10");
i = (0, normalize_intent_1.normalizeIntent)("bowling in Astoria");
strict_1.default.notEqual(activities(i.rawQuery)[0].id, "a10");
const qualifiedSpa = records.find((record) => record.id === "a10");
(0, strict_1.default)(qualifiedSpa);
(0, strict_1.default)((0, lowLevel_1.isQualifiedWellnessActivity)(qualifiedSpa));
strict_1.default.equal((0, lowLevel_1.isLowLevelLocation)(qualifiedSpa), false);
for (const term of ["spa", "massage", "wellness", "head spa", "float spa", "yoga spa", "recovery spa"])
    (0, strict_1.default)(!lowLevel_1.LOW_LEVEL_TERMS.includes(term), `${term} must not be a low-level cleanup term`);
i = (0, normalize_intent_1.normalizeIntent)("romantic steakhouse in Stamford CT");
strict_1.default.equal(i.searchType, "restaurant");
strict_1.default.equal(i.geo.city, "Stamford");
strict_1.default.equal(i.geo.state, "CT");
strict_1.default.equal(restaurants(i.rawQuery)[0].id, "r9");
// Walking-distance pair support
function pairIds(query) { const intent = (0, normalize_intent_1.normalizeIntent)(query); return { intent, pairs: (0, pairing_1.createSearchPairs)((0, ranking_1.rankRestaurantResults)(records, intent), (0, ranking_1.rankActivityResults)(records, intent), intent) }; }
let result = pairIds("steak dinner with bowling walking distance in Astoria");
strict_1.default.equal(result.intent.pairingPreference?.distanceMode, "walking");
strict_1.default.equal(result.intent.pairingPreference?.requireWalkablePair, true);
strict_1.default.equal(result.intent.pairingPreference?.maxPairDistanceMiles, 3);
strict_1.default.equal(result.intent.pairingPreference?.maxPairWalkingMinutes, 60);
assertNoCross(result.intent.rawQuery);
(0, strict_1.default)(result.pairs.length > 0);
(0, strict_1.default)(result.pairs.every((p) => p.pairWalkingMinutes != null && p.pairWalkingMinutes <= 60), "walking mode must reject pairs over 60 walking minutes");
(0, strict_1.default)(result.pairs.every((p) => p.activity.id !== "a2" && p.activity.id !== "a3" && p.restaurant.id !== "r2"));
strict_1.default.equal(result.pairs[0].restaurant.id, "r1");
strict_1.default.equal(result.pairs[0].activity.id, "a1");
(0, strict_1.default)(result.pairs[0].pairDistanceMiles != null);
(0, strict_1.default)(result.pairs[0].pairWalkingMinutes != null);
strict_1.default.equal(result.pairs[0].isWalkable, true);
(0, strict_1.default)(result.pairs[0].pairDistanceLabel.includes("walk"));
result = pairIds("sushi and karaoke close by in Manhattan");
strict_1.default.equal(result.intent.pairingPreference?.distanceMode, "nearby");
strict_1.default.equal(result.intent.pairingPreference?.maxPairDistanceMiles, 1.5);
(0, strict_1.default)(result.pairs.some((p) => p.restaurant.id === "r5" && p.activity.id === "a3"));
(0, strict_1.default)(result.pairs.every((p) => p.pairDistanceMiles != null && p.pairDistanceMiles <= 1.5));
result = pairIds("brunch and museum same area in Brooklyn");
strict_1.default.equal(result.intent.pairingPreference?.distanceMode, "same_area");
strict_1.default.equal(result.intent.pairingPreference?.maxPairDistanceMiles, 3);
(0, strict_1.default)(result.pairs.some((p) => p.restaurant.id === "r10" && p.activity.id === "a8"));
(0, strict_1.default)(result.pairs.every((p) => p.pairDistanceLabel));
result = pairIds("dinner and bowling in Queens");
strict_1.default.equal(result.intent.pairingPreference?.distanceMode, "any");
strict_1.default.equal(result.intent.pairingPreference?.requireWalkablePair, false);
(0, strict_1.default)(result.pairs.length > 0);
(0, strict_1.default)(result.pairs.some((p) => p.pairDistanceMiles != null));
const genericMixedOutingQueries = [
    "restaurant with activity walking distance",
    "restaurant with activities walking distance",
    "dinner and activity nearby",
    "dinner and activity walking distance",
    "dinner with something to do after",
    "restaurant and things to do walking distance",
    "casual dinner and relaxed activity",
    "date night dinner and activity",
    "brunch and activity nearby",
    "dinner and entertainment nearby",
];
for (const query of genericMixedOutingQueries) {
    const intent = (0, normalize_intent_1.normalizeIntent)(query);
    (0, strict_1.default)(["mixed_outing", "same_location_combo"].includes(intent.searchType), `${query}: should parse as mixed or same-location outing`);
    (0, strict_1.default)(intent.needsRestaurant, `${query}: should include restaurant intent`);
    (0, strict_1.default)((0, normalize_intent_1.activitySearchTerms)(intent).length > 0, `${query}: activity terms should not be empty`);
}
result = pairIds("restaurant with activity walking distance");
(0, strict_1.default)(["mixed_outing", "same_location_combo"].includes(result.intent.searchType));
strict_1.default.equal(result.intent.pairingPreference?.requiresPairing, true);
strict_1.default.equal(result.intent.pairingPreference?.distanceMode, "walking");
strict_1.default.equal(result.intent.pairingPreference?.requireWalkablePair, true);
(0, strict_1.default)(result.pairs.every((p) => p.pairWalkingMinutes != null && p.pairWalkingMinutes <= 60));
(0, strict_1.default)(result.pairs.every((p) => !p.pairWarnings.includes("missing_coordinates") && p.isWalkable));
console.log("search-quality-regression passed");
