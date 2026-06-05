import assert from "node:assert/strict";
import { createSearchPairs } from "../lib/search/enterprise/pairing";
import { normalizeIntent, restaurantSearchTerms, activitySearchTerms } from "../lib/search/enterprise/normalize-intent";
import { rankActivityResults, rankRestaurantResults } from "../lib/search/enterprise/ranking";
import type { EnterpriseLocation } from "../lib/search/enterprise/types";
import { isLowLevelLocation, isQualifiedWellnessActivity, LOW_LEVEL_TERMS } from "../lib/search/lowLevel";

const records: EnterpriseLocation[] = [
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
function restaurants(q:string){ const i=normalizeIntent(q); return rankRestaurantResults(records,i); }
function activities(q:string){ const i=normalizeIntent(q); return rankActivityResults(records,i); }
function assertNoCross(q:string){ const i=normalizeIntent(q); const rt=restaurantSearchTerms(i); const at=activitySearchTerms(i); for (const t of ["bowling","lanes","karaoke","museum","hookah","live music","walking distance","walking","walkable","nearby"]) assert(!rt.includes(t), `${q}: restaurant lane contains activity/distance term ${t}`); for (const t of ["steak","steakhouse","dinner","sushi","seafood","italian","brunch","walking distance","walking","walkable","nearby"]) assert(!at.includes(t), `${q}: activity lane contains food/distance term ${t}`); }

let i=normalizeIntent("steak dinner with bowling in Astoria"); assert.equal(i.searchType,"mixed_outing"); assert(i.needsRestaurant&&i.needsActivity&&i.wantsPairing); assert(restaurantSearchTerms(i).includes("steakhouse")); assert(activitySearchTerms(i).includes("bowling")); assert.equal(i.geo.neighborhood,"Astoria"); assert.equal(i.geo.borough,"Queens"); assert(i.geo.latitude&&i.geo.longitude); assertNoCross(i.rawQuery); let rr=rankRestaurantResults(records,i), aa=rankActivityResults(records,i); assert.equal(rr[0].id,"r1"); assert.equal(aa[0].id,"a1"); let pairs=createSearchPairs(rr,aa,i); assert(pairs[0].distance_miles != null);

i=normalizeIntent("steak dinner in Astoria"); assert.equal(i.searchType,"restaurant"); rr=restaurants(i.rawQuery); assert(rr.every(r=>String(r.search_document).includes("steak")||String(r.cuisine).toLowerCase().includes("steak"))); assert.equal(rr[0].id,"r1"); assert(rr.findIndex(r=>r.id==="r1") < rr.findIndex(r=>r.id==="r2"));

i=normalizeIntent("bowling in Astoria"); assert.equal(i.searchType,"activity"); aa=activities(i.rawQuery); assert(aa.every(a=>/bowling|lanes/i.test(String(a.search_document)+String(a.activity_type)))); assert.equal(aa[0].id,"a1");

i=normalizeIntent("rooftop dinner in Long Island City"); assert.equal(i.searchType,"restaurant"); assert.equal(i.geo.neighborhood,"Long Island City"); assert.equal(i.geo.borough,"Queens"); rr=restaurants(i.rawQuery); assert.equal(rr[0].id,"r4");

i=normalizeIntent("rooftop dinner with bowling in LIC"); assert.equal(i.searchType,"mixed_outing"); assert.equal(i.geo.neighborhood,"Long Island City"); pairs=createSearchPairs(rankRestaurantResults(records,i),rankActivityResults(records,i),i); assert(pairs[0].distance_miles != null);

i=normalizeIntent("sushi then karaoke in Manhattan"); assert.equal(i.searchType,"mixed_outing"); assert.equal(i.geo.borough,"Manhattan"); assert.equal(restaurants(i.rawQuery)[0].id,"r5"); assert.equal(activities(i.rawQuery)[0].id,"a3");

i=normalizeIntent("things to do in Queens"); assert.equal(i.searchType,"activity"); aa=activities(i.rawQuery); assert(aa.length>0); assert(!aa.some(a=>a.restaurant_name));

i=normalizeIntent("Italian restaurant in Nassau"); assert.equal(i.searchType,"restaurant"); assert.equal(i.geo.county,"Nassau County"); assert.equal(i.geo.region,"Long Island"); assert.notEqual(i.geo.neighborhood,"Long Island City"); assert.equal(restaurants(i.rawQuery)[0].id,"r6");

i=normalizeIntent("date night in Hoboken"); assert.equal(i.geo.city,"Hoboken"); assert.equal(i.geo.state,"NJ");

i=normalizeIntent("seafood and live music in Brooklyn"); assert.equal(restaurants(i.rawQuery)[0].id,"r7"); assert.equal(activities(i.rawQuery)[0].id,"a4");

i=normalizeIntent("brunch with museum in Manhattan"); assert.equal(restaurants(i.rawQuery)[0].id,"r8"); assert.equal(activities(i.rawQuery)[0].id,"a5");

i=normalizeIntent("hookah in Astoria"); assert.equal(i.searchType,"activity"); assert.equal(activities(i.rawQuery)[0].id,"a6");

i=normalizeIntent("dinner with hookah in Queens"); assert(i.needsRestaurant&&i.needsActivity); assert.equal(activities(i.rawQuery)[0].id,"a6");

i=normalizeIntent("best rooftop lounge in Jersey City"); assert.equal(i.searchType,"activity"); assert.equal(i.geo.city,"Jersey City"); assert.equal(i.geo.state,"NJ"); assert.equal(activities(i.rawQuery)[0].id,"a7");

i=normalizeIntent("spa day for self-care in Queens"); assert.equal(i.searchType,"activity"); aa=activities(i.rawQuery); assert.equal(aa[0].id,"a10");

i=normalizeIntent("bowling in Astoria"); assert.notEqual(activities(i.rawQuery)[0].id,"a10");

const qualifiedSpa = records.find((record) => record.id === "a10"); assert(qualifiedSpa); assert(isQualifiedWellnessActivity(qualifiedSpa)); assert.equal(isLowLevelLocation(qualifiedSpa), false); for (const term of ["spa", "massage", "wellness", "head spa", "float spa", "yoga spa", "recovery spa"]) assert(!LOW_LEVEL_TERMS.includes(term), `${term} must not be a low-level cleanup term`);

i=normalizeIntent("romantic steakhouse in Stamford CT"); assert.equal(i.searchType,"restaurant"); assert.equal(i.geo.city,"Stamford"); assert.equal(i.geo.state,"CT"); assert.equal(restaurants(i.rawQuery)[0].id,"r9");

// Walking-distance pair support
function pairIds(query: string) { const intent=normalizeIntent(query); return { intent, pairs: createSearchPairs(rankRestaurantResults(records,intent), rankActivityResults(records,intent), intent) }; }
let result = pairIds("steak dinner with bowling walking distance in Astoria");
assert.equal(result.intent.pairingPreference?.distanceMode, "walking");
assert.equal(result.intent.pairingPreference?.requireWalkablePair, true);
assert.equal(result.intent.pairingPreference?.maxPairDistanceMiles, 3);
assert.equal(result.intent.pairingPreference?.maxPairWalkingMinutes, 60);
assertNoCross(result.intent.rawQuery);
assert(result.pairs.length > 0);
assert(result.pairs.every((p)=>p.pairWalkingMinutes != null && p.pairWalkingMinutes <= 60), "walking mode must reject pairs over 60 walking minutes");
assert(result.pairs.every((p)=>p.activity.id !== "a2" && p.activity.id !== "a3" && p.restaurant.id !== "r2"));
assert.equal(result.pairs[0].restaurant.id, "r1");
assert.equal(result.pairs[0].activity.id, "a1");
assert(result.pairs[0].pairDistanceMiles != null);
assert(result.pairs[0].pairWalkingMinutes != null);
assert.equal(result.pairs[0].isWalkable, true);
assert(result.pairs[0].pairDistanceLabel.includes("walk"));

result = pairIds("sushi and karaoke close by in Manhattan");
assert.equal(result.intent.pairingPreference?.distanceMode, "nearby");
assert.equal(result.intent.pairingPreference?.maxPairDistanceMiles, 1.5);
assert(result.pairs.some((p)=>p.restaurant.id === "r5" && p.activity.id === "a3"));
assert(result.pairs.every((p)=>p.pairDistanceMiles != null && p.pairDistanceMiles <= 1.5));

result = pairIds("brunch and museum same area in Brooklyn");
assert.equal(result.intent.pairingPreference?.distanceMode, "same_area");
assert.equal(result.intent.pairingPreference?.maxPairDistanceMiles, 3);
assert(result.pairs.some((p)=>p.restaurant.id === "r10" && p.activity.id === "a8"));
assert(result.pairs.every((p)=>p.pairDistanceLabel));

result = pairIds("dinner and bowling in Queens");
assert.equal(result.intent.pairingPreference?.distanceMode, "any");
assert.equal(result.intent.pairingPreference?.requireWalkablePair, false);
assert(result.pairs.length > 0);
assert(result.pairs.some((p)=>p.pairDistanceMiles != null));

result = pairIds("restaurant with activity walking distance");
assert.equal(result.intent.searchType, "mixed_outing");
assert.equal(result.intent.pairingPreference?.requiresPairing, true);
assert.equal(result.intent.pairingPreference?.distanceMode, "walking");
assert.equal(result.intent.pairingPreference?.requireWalkablePair, true);
assert(result.pairs.every((p)=>p.pairWalkingMinutes != null && p.pairWalkingMinutes <= 60));
assert(result.pairs.every((p)=>!p.pairWarnings.includes("missing_coordinates") && p.isWalkable));

console.log("search-quality-regression passed");
