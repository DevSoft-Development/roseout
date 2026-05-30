import assert from "node:assert/strict";
import { normalizeIntent, restaurantSearchTerms, activitySearchTerms, rankRestaurantResults, rankActivityResults, createSearchPairs } from "../lib/search/enterprise";
import type { EnterpriseLocation } from "../lib/search/enterprise";

const records: EnterpriseLocation[] = [
  { id: "r1", name: "Astoria Prime Steakhouse", restaurant_name: "Astoria Prime Steakhouse", location_type: "restaurant", cuisine: "Steakhouse", primary_category: "Steakhouse", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", latitude: 40.765, longitude: -73.923, rating: 4.2, search_document: "steak ribeye porterhouse dinner romantic" },
  { id: "r2", name: "Queens Steak Grill", restaurant_name: "Queens Steak Grill", location_type: "restaurant", cuisine: "Steakhouse", neighborhood: "Long Island City", borough: "Queens", city: "New York", state: "NY", latitude: 40.746, longitude: -73.948, rating: 5, search_document: "steakhouse dinner" },
  { id: "r3", name: "Random High Rated Cafe", restaurant_name: "Random High Rated Cafe", location_type: "restaurant", cuisine: "Cafe", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", latitude: 40.764, longitude: -73.921, rating: 5, search_document: "salads coffee" },
  { id: "r4", name: "LIC Skyline Rooftop", restaurant_name: "LIC Skyline Rooftop", location_type: "restaurant", primary_category: "Rooftop Restaurant", cuisine: "American", neighborhood: "Long Island City", borough: "Queens", city: "New York", state: "NY", latitude: 40.745, longitude: -73.949, search_document: "rooftop dinner terrace skyline city views" },
  { id: "r5", name: "Manhattan Sushi", restaurant_name: "Manhattan Sushi", location_type: "restaurant", cuisine: "Sushi", neighborhood: "Midtown", borough: "Manhattan", city: "New York", state: "NY", latitude: 40.758, longitude: -73.985, search_document: "sushi omakase sashimi" },
  { id: "r6", name: "Nassau Trattoria", restaurant_name: "Nassau Trattoria", location_type: "restaurant", cuisine: "Italian", city: "Garden City", state: "NY", latitude: 40.726, longitude: -73.634, search_document: "italian pasta nassau county long island" },
  { id: "r7", name: "Brooklyn Seafood House", restaurant_name: "Brooklyn Seafood House", location_type: "restaurant", cuisine: "Seafood", borough: "Brooklyn", city: "New York", state: "NY", latitude: 40.68, longitude: -73.95, search_document: "seafood lobster oysters" },
  { id: "r8", name: "Manhattan Brunch", restaurant_name: "Manhattan Brunch", location_type: "restaurant", cuisine: "American", borough: "Manhattan", city: "New York", state: "NY", latitude: 40.77, longitude: -73.97, search_document: "brunch pancakes mimosa" },
  { id: "r9", name: "Stamford Steakhouse", restaurant_name: "Stamford Steakhouse", location_type: "restaurant", cuisine: "Steakhouse", city: "Stamford", state: "CT", latitude: 41.054, longitude: -73.539, search_document: "romantic steakhouse" },
  { id: "a1", name: "Astoria Bowl", activity_name: "Astoria Bowl", location_type: "activity", activity_type: "Bowling Alley", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", latitude: 40.766, longitude: -73.922, rating: 4.1, search_document: "bowling lanes bowling alley games" },
  { id: "a2", name: "Queens Lanes", activity_name: "Queens Lanes", location_type: "activity", activity_type: "Bowling", neighborhood: "Woodside", borough: "Queens", city: "New York", state: "NY", latitude: 40.744, longitude: -73.907, search_document: "bowling lanes" },
  { id: "a3", name: "Manhattan Karaoke", activity_name: "Manhattan Karaoke", location_type: "activity", activity_type: "Karaoke", borough: "Manhattan", city: "New York", state: "NY", latitude: 40.759, longitude: -73.986, search_document: "karaoke rooms" },
  { id: "a4", name: "Brooklyn Live Music Hall", activity_name: "Brooklyn Live Music Hall", location_type: "activity", activity_type: "Live Music", borough: "Brooklyn", city: "New York", state: "NY", latitude: 40.681, longitude: -73.946, search_document: "live music concert jazz" },
  { id: "a5", name: "Met Museum", activity_name: "Met Museum", location_type: "activity", activity_type: "Museum", borough: "Manhattan", city: "New York", state: "NY", latitude: 40.779, longitude: -73.963, search_document: "museum art exhibit" },
  { id: "a6", name: "Astoria Hookah Lounge", activity_name: "Astoria Hookah Lounge", location_type: "activity", activity_type: "Hookah Lounge", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", latitude: 40.764, longitude: -73.924, search_document: "hookah lounge nightlife" },
  { id: "a7", name: "Jersey City Rooftop Lounge", activity_name: "Jersey City Rooftop Lounge", location_type: "activity", activity_type: "Rooftop Lounge", city: "Jersey City", state: "NJ", latitude: 40.718, longitude: -74.043, search_document: "best rooftop lounge nightlife skyline" },
];
function restaurants(q:string){ const i=normalizeIntent(q); return rankRestaurantResults(records,i); }
function activities(q:string){ const i=normalizeIntent(q); return rankActivityResults(records,i); }
function assertNoCross(q:string){ const i=normalizeIntent(q); const rt=restaurantSearchTerms(i); const at=activitySearchTerms(i); for (const t of ["bowling","lanes","karaoke","museum","hookah","live music"]) assert(!rt.includes(t), `${q}: restaurant lane contains activity term ${t}`); for (const t of ["steak","steakhouse","dinner","sushi","seafood","italian","brunch"]) assert(!at.includes(t), `${q}: activity lane contains food term ${t}`); }

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

i=normalizeIntent("romantic steakhouse in Stamford CT"); assert.equal(i.searchType,"restaurant"); assert.equal(i.geo.city,"Stamford"); assert.equal(i.geo.state,"CT"); assert.equal(restaurants(i.rawQuery)[0].id,"r9");

console.log("search-quality-regression passed");
