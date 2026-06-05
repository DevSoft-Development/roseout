import assert from "node:assert/strict";
import { createPairingDebug, createSearchPairs } from "../lib/search/enterprise/pairing";
import { normalizeIntent, restaurantSearchTerms, activitySearchTerms } from "../lib/search/enterprise/normalize-intent";
import { rankActivityResults, rankRestaurantResults } from "../lib/search/enterprise/ranking";
import type { EnterpriseLocation } from "../lib/search/enterprise/types";
import { buildSafePairDistanceLabel, cleanDistanceLabel, formatDistanceFromRestaurant, isSafeWalkingLabel, shouldRejectPairForWalkingRoute } from "../lib/search/enterprise/distance";
import { toDisplayLabel } from "../lib/displayLabel";
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
assert.equal(result.intent.pairingPreference?.maxPairDistanceMiles, 1.5);
assertNoCross(result.intent.rawQuery);
assert(result.pairs.length > 0);
assert(result.pairs.filter((p)=>!p.pairWarnings.includes("missing_coordinates_walkability_unverified")).every((p)=>p.pairDistanceMiles != null && p.pairDistanceMiles <= 1.5), "walking mode must reject coordinate-valid pairs over 1.5 miles");
assert.equal(result.pairs[0].restaurant.id, "r1");
assert.equal(result.pairs[0].activity.id, "a1");
assert(result.pairs[0].pairDistanceMiles != null);
assert(result.pairs[0].pairWalkingMinutes != null);
assert.equal(result.pairs[0].isWalkable, true);
assert(result.pairs[0].pairDistanceLabel.includes("walk"));

result = pairIds("sushi and karaoke close by in Manhattan");
assert.equal(result.intent.pairingPreference?.distanceMode, "nearby");
assert.equal(result.intent.pairingPreference?.maxPairDistanceMiles, 2.5);
assert(result.pairs.some((p)=>p.restaurant.id === "r5" && p.activity.id === "a3"));
assert(result.pairs.every((p)=>p.pairDistanceMiles != null && p.pairDistanceMiles <= 2.5));

result = pairIds("brunch and museum same area in Brooklyn");
assert.equal(result.intent.pairingPreference?.distanceMode, "same_area");
assert.equal(result.intent.pairingPreference?.maxPairDistanceMiles, 5);
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
assert(result.pairs.every((p)=>p.pairDistanceMiles != null && p.pairDistanceMiles <= 1.5));
assert(result.pairs.filter((p)=>!p.pairWarnings.includes("missing_coordinates_walkability_unverified")).every((p)=>!p.pairWarnings.includes("missing_coordinates") && p.isWalkable));


function assertRestaurantOnlyDrinksQuery(query: string) {
  const intent = normalizeIntent(query);
  assert.equal(intent.needsRestaurant, true, `${query} should need restaurants`);
  assert.equal(intent.needsActivity, false, `${query} should not need activities`);
  assert.equal(intent.wantsPairing, false, `${query} should not request pairing`);
  assert.equal(intent.primaryDomain, "restaurant", `${query} primary domain`);
  assert.equal(intent.searchType, "restaurant", `${query} search type`);
  assert.equal(activitySearchTerms(intent).length, 0, `${query} should not build activity terms`);
  if (/\b(steak|sushi|seafood|italian|mexican)\b/i.test(query)) {
    assert(restaurantSearchTerms(intent).some((term) => ["steak", "sushi", "seafood", "italian", "mexican"].includes(term)), `${query} should keep specific restaurant terms`);
    assert(!restaurantSearchTerms(intent).includes("dinner"), `${query} should prune generic meal terms when specific food exists`);
  } else {
    assert(restaurantSearchTerms(intent).includes("dinner") || restaurantSearchTerms(intent).includes("restaurant"), `${query} should keep restaurant terms`);
  }
}

for (const query of [
  "group dinner and drinks",
  "group dinner with drinks",
  "group dinner with cocktails",
  "dinner and cocktails",
  "dinner with cocktails",
  "steak dinner and drinks",
  "date night dinner and drinks",
  "birthday dinner and cocktails",
  "restaurant with drinks",
  "rooftop dinner and drinks",
]) {
  assertRestaurantOnlyDrinksQuery(query);
}

for (const query of [
  "group dinner and drinks after",
  "group dinner then drinks",
  "group dinner then lounge",
  "dinner and bar after",
  "dinner and cocktails after",
  "steak dinner then hookah",
  "dinner then dancing",
  "dinner and activity nearby",
  "dinner then things to do",
]) {
  const intent = normalizeIntent(query);
  assert.equal(intent.needsRestaurant, true, `${query} should need restaurants`);
  assert.equal(intent.needsActivity, true, `${query} should need activities`);
  assert.equal(intent.wantsPairing, true, `${query} should request pairing`);
  assert.equal(intent.searchType, "mixed_outing", `${query} search type`);
  assert.equal(intent.primaryDomain, "mixed", `${query} primary domain`);
}


function assertRooftopDrinkActivityQuery(query: string, expectedFood: string) {
  const intent = normalizeIntent(query);
  assert.equal(intent.searchType, "mixed_outing", `${query} search type`);
  assert.equal(intent.needsRestaurant, true, `${query} should need restaurants`);
  assert.equal(intent.needsActivity, true, `${query} should need activities`);
  assert(
    intent.restaurantIntent.foodTerms.includes(expectedFood) || intent.restaurantIntent.mealTerms.includes(expectedFood),
    `${query} should keep ${expectedFood} in the restaurant lane`,
  );
  assert(!intent.restaurantIntent.featureTerms.includes("rooftop"), `${query} should not keep rooftop in restaurant feature terms`);
  assert(
    ["rooftop", "rooftop bar", "rooftop lounge", "rooftop drinks"].some((term) => intent.activityIntent.activityTerms.includes(term)),
    `${query} should route rooftop to activity terms`,
  );
  assert(
    intent.activityIntent.activityTerms.includes("drinks") || intent.activityIntent.activityTerms.includes("cocktails"),
    `${query} should route drinks/cocktails to activity terms`,
  );
}

assertRooftopDrinkActivityQuery("steak dinner and rooftop drinks after", "steak");
assertRooftopDrinkActivityQuery("birthday dinner and rooftop cocktails after", "birthday dinner");

const rooftopDinnerIntent = normalizeIntent("rooftop dinner");
assert.equal(rooftopDinnerIntent.needsRestaurant, true, "rooftop dinner should need restaurants");
assert(rooftopDinnerIntent.restaurantIntent.featureTerms.includes("rooftop"), "rooftop dinner should keep rooftop as a restaurant feature");
assert.equal(rooftopDinnerIntent.needsActivity, false, "rooftop dinner should not force activity-only or pairing intent");

const groupDinnerAndDrinks = normalizeIntent("group dinner and drinks");
for (const forbidden of ["theater", "dancing", "nightlife", "club", "dance club", "live dj"]) {
  assert(!activitySearchTerms(groupDinnerAndDrinks).includes(forbidden), `group dinner and drinks must not include ${forbidden} as an activity term`);
}


const expectedSteakRpcTerms = ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon", "sirloin", "tomahawk", "prime rib", "churrasco", "brazilian steakhouse"];
const steakHookahIntent = normalizeIntent("steak dinner and hookah lounge after");
assert.deepEqual(restaurantSearchTerms(steakHookahIntent), expectedSteakRpcTerms, "steak dinner should send steak RPC terms without generic dinner");
assert.deepEqual(activitySearchTerms(steakHookahIntent), ["hookah", "hookah lounge", "hookah bar", "shisha"], "hookah lounge should not expand into broad nightlife RPC terms");
for (const forbidden of ["dinner", "restaurant", "restaurants", "dining", "lunch", "brunch", "breakfast", "meal", "food", "eat", "eats"]) {
  assert(!restaurantSearchTerms(steakHookahIntent).includes(forbidden), `steak hookah restaurant RPC terms must not include ${forbidden}`);
}
for (const forbidden of ["lounge", "drinks", "cocktails", "nightlife", "bar", "rooftop lounge", "club", "dance club", "dancing", "live dj", "speakeasy"]) {
  assert(!activitySearchTerms(steakHookahIntent).includes(forbidden), `steak hookah activity RPC terms must not include ${forbidden}`);
}
const hookahRankIntent = normalizeIntent("hookah lounge after steak dinner");
assert.equal(rankActivityResults(records, hookahRankIntent)[0]?.id, "a6", "hookah intent should rank hookah records first");
assert(!rankActivityResults(records, hookahRankIntent).some((record) => record.id === "a7"), "hookah intent should reject broad rooftop lounge records without hookah/shisha text");


const rooftopWalk30 = normalizeIntent("steak dinner and rooftop drinks 30 minute walk apart");
assert.equal(rooftopWalk30.searchType, "mixed_outing");
assert.equal(rooftopWalk30.primaryDomain, "mixed");
assert.equal(rooftopWalk30.needsRestaurant, true);
assert.equal(rooftopWalk30.needsActivity, true);
assert.equal(rooftopWalk30.wantsPairing, true);
assert.equal(rooftopWalk30.pairingPreference?.distanceMode, "walking");
assert.equal(rooftopWalk30.pairingPreference?.maxPairWalkingMinutes, 30);
assert.equal(rooftopWalk30.pairingPreference?.maxPairDistanceMiles, 1.5);
assert.equal(rooftopWalk30.pairingPreference?.requireWalkablePair, true);
for (const term of ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon", "sirloin", "tomahawk", "prime rib"]) {
  assert(restaurantSearchTerms(rooftopWalk30).includes(term), `30-minute rooftop query restaurant RPC should include ${term}`);
}
for (const forbidden of ["rooftop", "rooftop drinks", "drinks", "cocktails", "bar", "lounge"]) {
  assert(!restaurantSearchTerms(rooftopWalk30).includes(forbidden), `30-minute rooftop query restaurant RPC should not include ${forbidden}`);
}
for (const term of ["rooftop drinks", "rooftop", "rooftop bar", "rooftop lounge", "drinks", "cocktails", "bar", "lounge"]) {
  assert(activitySearchTerms(rooftopWalk30).includes(term), `30-minute rooftop query activity RPC should include ${term}`);
}
assert.equal(rooftopWalk30.activityIntent.categoryTerms.includes("bar"), true);
assert.equal(rooftopWalk30.activityIntent.categoryTerms.includes("lounge"), true);
assert.equal(rooftopWalk30.activityIntent.featureTerms.includes("rooftop"), true);
for (const forbidden of ["theater", "theatre", "museum", "bowling", "arcade", "park"]) {
  assert(!activitySearchTerms(rooftopWalk30).includes(forbidden), `rooftop drinks fallback terms should not include ${forbidden}`);
}

const rooftopWalk20 = normalizeIntent("steak dinner and rooftop drinks 20 minute walk apart");
assert.equal(rooftopWalk20.pairingPreference?.maxPairWalkingMinutes, 20);
assert.equal(rooftopWalk20.pairingPreference?.maxPairDistanceMiles, 1);
const rooftopWalk40 = normalizeIntent("steak dinner and rooftop drinks 40 minute walk apart");
assert.equal(rooftopWalk40.pairingPreference?.maxPairWalkingMinutes, 40);
assert.equal(rooftopWalk40.pairingPreference?.maxPairDistanceMiles, 2);
const rooftopWalk60 = normalizeIntent("steak dinner and rooftop drinks 60 minute walk apart");
assert.equal(rooftopWalk60.pairingPreference?.maxPairWalkingMinutes, 45);
assert.equal(rooftopWalk60.pairingPreference?.maxPairDistanceMiles, 2.3);

const rooftopAny = normalizeIntent("steak dinner and rooftop drinks");
assert.equal(rooftopAny.pairingPreference?.distanceMode, "any");
assert.equal(rooftopAny.pairingPreference?.maxPairDistanceMiles, null);
const rooftopNearby = normalizeIntent("steak dinner and rooftop drinks nearby");
assert.equal(rooftopNearby.pairingPreference?.distanceMode, "nearby");
assert.equal(rooftopNearby.pairingPreference?.maxPairDistanceMiles, 2.5);
const rooftopShortWalk = normalizeIntent("steak dinner and rooftop drinks short walk");
assert.equal(rooftopShortWalk.pairingPreference?.distanceMode, "short_walk");
assert.equal(rooftopShortWalk.pairingPreference?.maxPairDistanceMiles, 0.75);
const afterOnly = normalizeIntent("seafood dinner with theatre after");
assert.equal(afterOnly.pairingPreference?.distanceMode, "any", "after by itself should sequence stops without proximity constraints");

const distanceIntent = normalizeIntent("steak dinner and rooftop drinks 30 minute walk apart");
const baseRestaurant: EnterpriseLocation = { id: "dr", name: "Distance Steak", restaurant_name: "Distance Steak", location_type: "restaurant", cuisine: "Steakhouse", city: "New York", state: "NY", latitude: 40, longitude: -73, image_url: "r.jpg", search_document: "steak steakhouse dinner" };
const distanceActivities: EnterpriseLocation[] = [
  { id: "pa", name: "Pair A", activity_name: "Pair A", location_type: "activity", activity_type: "Rooftop Lounge", city: "New York", state: "NY", latitude: 40, longitude: -72.9948, image_url: "a.jpg", search_document: "rooftop lounge drinks cocktails bar" },
  { id: "pb", name: "Pair B", activity_name: "Pair B", location_type: "activity", activity_type: "Rooftop Lounge", city: "New York", state: "NY", latitude: 40, longitude: -72.9857, image_url: "b.jpg", search_document: "rooftop lounge drinks cocktails bar" },
  { id: "pc", name: "Pair C", activity_name: "Pair C", location_type: "activity", activity_type: "Rooftop Lounge", city: "New York", state: "NY", latitude: 40, longitude: -72.9805, image_url: "c.jpg", search_document: "rooftop lounge drinks cocktails bar" },
  { id: "pd", name: "Pair D", activity_name: "Pair D", location_type: "activity", activity_type: "Rooftop Lounge", city: "New York", state: "NY", latitude: 40, longitude: -72.966, image_url: "d.jpg", search_document: "rooftop lounge drinks cocktails bar" },
];
const walkingPairs = createSearchPairs([baseRestaurant], distanceActivities, distanceIntent);
assert.deepEqual(walkingPairs.map((pair) => pair.activity.id), ["pa", "pb", "pc"]);
assert(walkingPairs.every((pair) => pair.pairDistanceMiles != null && pair.pairDistanceMiles <= 1.5));

const geoIntent = normalizeIntent("steak dinner and rooftop drinks");
const geoRestaurant: EnterpriseLocation = { ...baseRestaurant, id: "gr", city: "New York", state: "NY", latitude: 40, longitude: -73, match_score: 100, image_url: "r.jpg" };
const geoActivities: EnterpriseLocation[] = [
  { id: "gb", name: "Different State Close", activity_name: "Different State Close", location_type: "activity", activity_type: "Rooftop Lounge", city: "Hoboken", state: "NJ", latitude: 40, longitude: -72.9935, match_score: 1000, image_url: "b.jpg", search_document: "rooftop lounge drinks cocktails bar" },
  { id: "gc", name: "Same State Different City", activity_name: "Same State Different City", location_type: "activity", activity_type: "Rooftop Lounge", city: "Yonkers", state: "NY", latitude: 40, longitude: -72.987, match_score: 100, image_url: "c.jpg", search_document: "rooftop lounge drinks cocktails bar" },
  { id: "ga", name: "Same City", activity_name: "Same City", location_type: "activity", activity_type: "Rooftop Lounge", city: "New York", state: "NY", latitude: 40, longitude: -72.961, match_score: 10, image_url: "a.jpg", search_document: "rooftop lounge drinks cocktails bar" },
  { id: "gd", name: "Missing Coordinates", activity_name: "Missing Coordinates", location_type: "activity", activity_type: "Rooftop Lounge", city: "New York", state: "NY", image_url: "d.jpg", search_document: "rooftop lounge drinks cocktails bar" },
];
const geoPairs = createSearchPairs([geoRestaurant], geoActivities, geoIntent);
assert.equal(geoPairs[0].activity.id, "ga");
assert(geoPairs.findIndex((pair) => pair.activity.id === "gc") < geoPairs.findIndex((pair) => pair.activity.id === "gb"));
assert.equal(geoPairs.at(-1)?.activity.id, "gd");


const routeFilterDebug = createPairingDebug();
const routeRestaurant: EnterpriseLocation = { id: "rr", name: "Route Steak", restaurant_name: "Route Steak", location_type: "restaurant", cuisine: "Steakhouse", city: "New York", state: "NY", latitude: 40, longitude: -73, image_url: "r.jpg", search_document: "steak steakhouse dinner" };
const routeActivities: EnterpriseLocation[] = [
  { id: "ra", name: "A", activity_name: "A", location_type: "activity", activity_type: "Rooftop Lounge", city: "New York", state: "NY", latitude: 40, longitude: -72.985, image_url: "a.jpg", walkingDurationMinutes: 18, search_document: "rooftop lounge drinks" },
  { id: "rb", name: "B", activity_name: "B", location_type: "activity", activity_type: "Rooftop Lounge", city: "New York", state: "NY", latitude: 40, longitude: -72.974, image_url: "b.jpg", walkingDurationMinutes: 30, search_document: "rooftop lounge drinks" },
  { id: "rc", name: "C", activity_name: "C", location_type: "activity", activity_type: "Rooftop Lounge", city: "New York", state: "NY", latitude: 40, longitude: -72.976, image_url: "c.jpg", walkingDurationMinutes: 31, search_document: "rooftop lounge drinks" },
  { id: "rd", name: "D", activity_name: "D", location_type: "activity", activity_type: "Rooftop Lounge", city: "New York", state: "NY", latitude: 40, longitude: -72.989, image_url: "d.jpg", walkingDurationMinutes: 496, search_document: "rooftop lounge drinks" },
];
const routeFilteredPairs = createSearchPairs([routeRestaurant], routeActivities, distanceIntent, routeFilterDebug);
assert.deepEqual(routeFilteredPairs.map((pair) => pair.activity.id), ["ra", "rb"], "30-minute walking route filter should include only 18- and 30-minute routes");
assert.equal(routeFilterDebug.pairsRejectedForWalkingMinutes, 2);
assert.equal(routeFilterDebug.extremeWalkingRoutesRejected, 1);
assert(routeFilterDebug.rejectedPairs.some((pair) => pair.activityName === "C" && pair.reason === "walking_route_exceeds_requested_minutes"));
assert(routeFilterDebug.rejectedPairs.some((pair) => pair.activityName === "D" && pair.walkingDurationMinutes === 496 && pair.reason === "extreme_walking_route_duration"));

const noValidWalkDebug = createPairingDebug();
const noValidPairs = createSearchPairs([routeRestaurant], routeActivities.slice(2), distanceIntent, noValidWalkDebug);
assert.equal(routeActivities.slice(2).length, 2, "rooftop activities can exist before pairing");
assert.equal(noValidPairs.length, 0, "walking pairing should have zero valid pairs when all rooftop activities exceed the route limit");
assert.equal(noValidWalkDebug.pairCandidatesEvaluated, 2);
assert.equal(noValidWalkDebug.validPairCountBeforeRender, 0);

const extremeWalkingLabel = buildSafePairDistanceLabel({
  pair: { walkingDurationMinutes: 496 },
  restaurantName: "Fogo de Chão Brazilian Steakhouse",
  pairDistanceMiles: 0.6,
  pairingPreference: { requiresPairing: true, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false },
});
assert(!extremeWalkingLabel.includes("496 min walk"), "extreme walking routes should never render as walking labels");
assert.equal(extremeWalkingLabel, "0.6 mi from Fogo de Chão Brazilian Steakhouse");


const googleRouteLabel = "18 min walk from Fogo de Chão Brazilian Steakhouse • Google walking route";
assert.equal(
  cleanDistanceLabel(googleRouteLabel),
  "18 min walk from Fogo de Chão Brazilian Steakhouse",
  "Google walking route wording should be removed from safe labels",
);
assert.equal(
  buildSafePairDistanceLabel({
    pair: { walkingDurationMinutes: 18 },
    restaurantName: "Fogo de Chão Brazilian Steakhouse",
    pairDistanceMiles: 0.6,
    pairingPreference: { requiresPairing: true, distanceMode: "walking", maxPairDistanceMiles: null, maxPairWalkingMinutes: 30, requireWalkablePair: true },
  }),
  "18 min walk from Fogo de Chão Brazilian Steakhouse",
  "safe walking route labels should render without Google route wording",
);

const unsafe288Label = "288 min walk from Fogo de Chão Brazilian Steakhouse • Google walking route";
assert.equal(cleanDistanceLabel(unsafe288Label), undefined, "288-minute walking labels should be hidden");
assert.equal(isSafeWalkingLabel(unsafe288Label), false, "288-minute walking labels should not be considered safe");
assert.equal(
  buildSafePairDistanceLabel({
    pair: { walkingDurationMinutes: 288 },
    restaurantName: "Fogo de Chão Brazilian Steakhouse",
    pairDistanceMiles: 2.4,
    pairingPreference: { requiresPairing: true, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false },
  }),
  "2.4 mi from Fogo de Chão Brazilian Steakhouse",
  "unsafe 288-minute walking labels should fall back to miles",
);

const unsafe496Label = "496 min walk from Fogo de Chão Brazilian Steakhouse • Google walking route";
assert.equal(cleanDistanceLabel(unsafe496Label), undefined, "496-minute walking labels should be hidden");
assert.equal(
  buildSafePairDistanceLabel({
    pair: { walkingDurationMinutes: 496 },
    restaurantName: "Fogo de Chão Brazilian Steakhouse",
    pairDistanceMiles: 2.4,
    pairingPreference: { requiresPairing: true, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false },
  }),
  "2.4 mi from Fogo de Chão Brazilian Steakhouse",
  "unsafe 496-minute walking labels should fall back to miles",
);


assert.equal(
  formatDistanceFromRestaurant({
    pair: { walkingDurationMinutes: null, pairDistanceMiles: 0.4 },
    restaurantName: "The Modern",
    pairingPreference: { distanceMode: "walking", maxPairWalkingMinutes: 30 },
  }),
  "8 min walk from The Modern",
  "walking queries should estimate walking minutes from miles when route minutes are missing",
);
assert.equal(
  formatDistanceFromRestaurant({
    pair: { walkingDurationMinutes: 6, pairDistanceMiles: 0.4 },
    restaurantName: "The Modern",
    pairingPreference: { distanceMode: "walking", maxPairWalkingMinutes: 30 },
  }),
  "6 min walk from The Modern",
  "walking queries should prefer safe Google walking minutes",
);
assert.deepEqual(
  shouldRejectPairForWalkingRoute(
    { walkingDurationMinutes: 158 },
    { requiresPairing: true, distanceMode: "walking", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: true },
  ),
  { reject: true, reason: "walking_route_exceeds_default_60_minutes" },
  "walking queries should reject Google walking routes over the default 60-minute cap",
);
assert.deepEqual(
  shouldRejectPairForWalkingRoute(
    { walkingDurationMinutes: 45 },
    { requiresPairing: true, distanceMode: "walking", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: true },
  ),
  { reject: false, reason: null },
  "walking queries should keep Google walking routes under the default 60-minute cap",
);
assert.deepEqual(
  shouldRejectPairForWalkingRoute(
    { walkingDurationMinutes: 61 },
    { requiresPairing: true, distanceMode: "walking", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: true },
  ),
  { reject: true, reason: "walking_route_exceeds_default_60_minutes" },
  "walking queries should reject Google walking routes just over the default 60-minute cap",
);
assert.deepEqual(
  shouldRejectPairForWalkingRoute(
    { walkingDurationMinutes: 45 },
    { requiresPairing: true, distanceMode: "walking", maxPairDistanceMiles: null, maxPairWalkingMinutes: 30, requireWalkablePair: true },
  ),
  { reject: true, reason: "walking_route_exceeds_requested_minutes" },
  "walking queries should respect a user walking cap lower than 60 minutes",
);
assert.deepEqual(
  shouldRejectPairForWalkingRoute(
    { walkingDurationMinutes: 158 },
    { requiresPairing: true, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false },
  ),
  { reject: false, reason: null },
  "non-walking queries should not reject solely because route minutes exceed 60",
);
assert.equal(
  formatDistanceFromRestaurant({
    pair: { walkingDurationMinutes: null, pairDistanceMiles: 0.4 },
    restaurantName: "The Modern",
    pairingPreference: { distanceMode: "any", maxPairWalkingMinutes: null, requireWalkablePair: false },
  }),
  "0.4 mi from The Modern",
  "non-walking queries should prefer miles",
);
assert.equal(
  formatDistanceFromRestaurant({
    pair: { walkingDurationMinutes: 288, pairDistanceMiles: 0.4 },
    restaurantName: "The Modern",
    pairingPreference: { distanceMode: "walking" },
  }),
  "8 min walk from The Modern",
  "unsafe walking durations should fall back to estimated walking minutes in walking mode",
);

assert.equal(
  formatDistanceFromRestaurant({
    pair: { walkingDurationMinutes: 288 },
    restaurantName: "The Modern",
    pairingPreference: { distanceMode: "walking" },
  }),
  "Distance unavailable",
  "unsafe walking durations without miles should be unavailable",
);
assert.equal(
  formatDistanceFromRestaurant({
    pair: { walkingDurationMinutes: null, pairDistanceMiles: 0.15 },
    restaurantName: "Restaurant Name",
    pairingPreference: { distanceMode: "walking" },
  }),
  "3 min walk from Restaurant Name",
);
assert.equal(
  formatDistanceFromRestaurant({
    pair: { walkingDurationMinutes: null, pairDistanceMiles: 0.73 },
    restaurantName: "Restaurant Name",
    pairingPreference: { distanceMode: "walking" },
  }),
  "15 min walk from Restaurant Name",
);
assert(!formatDistanceFromRestaurant({
  pair: { walkingDurationMinutes: 18, pairDistanceMiles: 0.6 },
  restaurantName: "Fogo de Chão Brazilian Steakhouse",
  pairingPreference: { distanceMode: "walking" },
}).includes("Google walking route"));
assert.equal(toDisplayLabel("Fine_dining"), "Fine Dining");
assert.equal(toDisplayLabel("rooftop_bar"), "Rooftop Bar");

const sortedRoutePairs = createSearchPairs([routeRestaurant], [routeActivities[2], routeActivities[1], routeActivities[0]], distanceIntent);
assert.deepEqual(sortedRoutePairs.map((pair) => pair.activity.id), ["ra", "rb"], "valid route pairs should sort nearest-first before lower-priority scoring");

console.log("search-quality-regression passed");

const genericRooftopWalkingIntent = normalizeIntent("restaurant and rooftop drinks after walking distance");
const qualityRestaurants: EnterpriseLocation[] = [
  { id: "qr1", name: "Dave's Hot Chicken", restaurant_name: "Dave's Hot Chicken", location_type: "restaurant", primary_category: "fast_food", cuisine: "Chicken", latitude: 40.758, longitude: -73.985, rating: 4.5, review_count: 900, has_photos: true, search_document: "fast food quick service hot chicken counter service chain" },
  { id: "qr2", name: "The Modern", restaurant_name: "The Modern", location_type: "restaurant", primary_category: "fine_dining", cuisine: "New American", latitude: 40.7614, longitude: -73.9779, rating: 4.7, review_count: 2500, has_photos: true, public_visibility_tier: "premium", quality_status: "published", search_document: "fine dining full service upscale romantic date night cocktails dinner restaurant" },
  { id: "qr3", name: "OLIO E PIÙ Bryant Park", restaurant_name: "OLIO E PIÙ Bryant Park", location_type: "restaurant", primary_category: "full_service", cuisine: "Italian", latitude: 40.7539, longitude: -73.9836, rating: 4.6, review_count: 1300, has_photos: true, quality_status: "verified", search_document: "full service italian restaurant dinner date night wine cocktails" },
  { id: "qr4", name: "MOE EATS NYC", restaurant_name: "MOE EATS NYC", location_type: "restaurant", primary_category: "restaurant", latitude: 40.7509, longitude: -73.9857, rating: 4.6, review_count: 700, has_photos: true, search_document: "casual eats quick bite takeout delivery" },
  { id: "qr5", name: "La Grande Boucherie", restaurant_name: "La Grande Boucherie", location_type: "restaurant", primary_category: "brasserie", cuisine: "French", latitude: 40.7529, longitude: -73.9857, rating: 4.5, review_count: 6500, has_photos: true, public_visibility_tier: "featured", curation_tier: "curated", quality_status: "verified", search_document: "brasserie full service upscale romantic date night dinner cocktails reservations elegant ambiance" },
  { id: "qr6", name: "Parker & Quinn", restaurant_name: "Parker & Quinn", location_type: "restaurant", primary_category: "full_service", cuisine: "American", latitude: 40.7519, longitude: -73.9857, rating: 4.4, review_count: 1800, has_photos: true, quality_status: "published", search_document: "full service restaurant cocktail dinner lounge reservations date night" },
];
const rankedGenericRestaurants = rankRestaurantResults(qualityRestaurants, genericRooftopWalkingIntent).map((record) => record.name);
assert(rankedGenericRestaurants.indexOf("The Modern") < rankedGenericRestaurants.indexOf("Dave's Hot Chicken"), "fine dining should outrank fast-food for generic restaurant/dinner queries");
assert(rankedGenericRestaurants.indexOf("OLIO E PIÙ Bryant Park") < rankedGenericRestaurants.indexOf("Dave's Hot Chicken"), "full-service dinner should outrank fast-food for generic restaurant/dinner queries");
const moe = qualityRestaurants.find((record) => record.name === "MOE EATS NYC");
const boucherie = qualityRestaurants.find((record) => record.name === "La Grande Boucherie");
const parker = qualityRestaurants.find((record) => record.name === "Parker & Quinn");
assert(moe && boucherie && parker);
assert(Number((boucherie as any).restaurantOutingFitScore) > Number((moe as any).restaurantOutingFitScore), "brasserie/full-service/upscale restaurant should have higher outingFitScore than generic eats venue");
assert(Number((parker as any).restaurantOutingFitScore) > Number((moe as any).restaurantOutingFitScore), "full-service cocktail/dinner restaurant should have higher outingFitScore than generic eats venue");

const casualChickenIntent = normalizeIntent("casual chicken dinner and rooftop drinks walking distance");
const rankedCasualRestaurants = rankRestaurantResults(qualityRestaurants, casualChickenIntent).map((record) => record.name);
assert(rankedCasualRestaurants.indexOf("Dave's Hot Chicken") <= 1, "requested casual/chicken fit may rank fast-casual candidates higher");

const rooftopActivities: EnterpriseLocation[] = [
  { id: "qa1", name: "Monarch Rooftop Lounge", activity_name: "Monarch Rooftop Lounge", location_type: "activity", activity_type: "rooftop_lounge", primary_category: "rooftop_bar", latitude: 40.7505, longitude: -73.9864, rating: 4.5, review_count: 1200, has_photos: true, quality_status: "published", search_document: "real rooftop lounge rooftop bar cocktails skyline views terrace nightlife" },
  { id: "qa2", name: "Rooftop Bars NYC", activity_name: "Rooftop Bars NYC", location_type: "activity", activity_type: "rooftop", primary_category: "listing", latitude: 40.751, longitude: -73.986, rating: 4.8, review_count: 50, has_photos: false, search_document: "best rooftop bars nyc guide to rooftop bars list" },
  { id: "qa3", name: "Broadway Playhouse", activity_name: "Broadway Playhouse", location_type: "activity", activity_type: "theater", primary_category: "theater", latitude: 40.759, longitude: -73.985, rating: 4.7, review_count: 2000, has_photos: true, search_document: "theater theatre broadway performance musical" },
  { id: "qa4", name: "Refinery Rooftop", activity_name: "Refinery Rooftop", location_type: "activity", activity_type: "rooftop_lounge", primary_category: "rooftop_bar", latitude: 40.7525, longitude: -73.9862, rating: 4.4, review_count: 1600, has_photos: true, quality_status: "verified", search_document: "rooftop lounge rooftop bar cocktails skyline views terrace nightlife" },
];
const rankedRooftopActivities = rankActivityResults(rooftopActivities, genericRooftopWalkingIntent).map((record) => record.name);
assert.equal(rankedRooftopActivities[0], "Monarch Rooftop Lounge", "real rooftop lounge/bar should rank first for rooftop drinks");
assert(!rankedRooftopActivities.includes("Broadway Playhouse"), "theater should be suppressed unless requested for rooftop drinks");
assert(rankedRooftopActivities.indexOf("Rooftop Bars NYC") > rankedRooftopActivities.indexOf("Monarch Rooftop Lounge"), "aggregator-style rooftop listing should rank below real venues");

const theatreIntent = normalizeIntent("seafood dinner with theatre after");
assert(rankActivityResults(rooftopActivities, theatreIntent).some((record) => record.name === "Broadway Playhouse"), "theater activities should be allowed when theatre is requested");

const pairDebug = createPairingDebug();
const pairQualityResults = createSearchPairs(qualityRestaurants, rooftopActivities, genericRooftopWalkingIntent, pairDebug);
assert.equal(pairDebug.finalPairSortReason, "market_quality_then_distance");
assert(pairDebug.pairQualityScorePreview.length > 0, "pair quality debug preview should be populated");
assert(Number((pairQualityResults[0] as any).pairQualityTier) >= Number((pairQualityResults.at(-1) as any).pairQualityTier), "pairs should sort by quality tier before tiny distance differences");
assert.notEqual(pairQualityResults[0]?.restaurant.name, "Dave's Hot Chicken", "ultra-close fast-food pairs should not dominate stronger generic outing pairs");
assert.notEqual(pairQualityResults[0]?.restaurant.name, "MOE EATS NYC", "ultra-close weak outing-fit pairs should not dominate stronger generic outing pairs");
assert(pairQualityResults.some((pair) => pair.restaurant.name === "La Grande Boucherie" || pair.restaurant.name === "Parker & Quinn"), "strong full-service restaurants should remain renderable in pair results");
assert(pairDebug.pairQualityTierCounts.tier3 + pairDebug.pairQualityTierCounts.tier2 >= 5, "test fixture should include at least 5 strong tier 2/3 pairs");
assert(pairDebug.suppressedWeakOutingFitPairCount > 0, "tier 0 weak outing-fit pairs should be suppressed when enough tier 2/3 pairs exist");
assert("restaurantOutingFitScore" in pairDebug.pairQualityScorePreview[0], "pair debug preview should include restaurant outing fit score");

assert.equal(toDisplayLabel("Fine_dining"), "Fine Dining", "raw enum labels should be display formatted");
assert(!cleanDistanceLabel("8 min walk from The Modern • Google walking route")?.includes("Google walking route"), "Google walking route wording should be removed from visible labels");
