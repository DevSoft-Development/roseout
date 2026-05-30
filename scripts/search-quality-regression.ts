import assert from "node:assert/strict";
import { parseCanonicalIntent } from "../lib/search/intent";
import { buildActivitySearchInput, buildRestaurantSearchInput } from "../lib/search/queryBuilders";
import { detectRequestedGeo, scoreGeoMatch } from "../lib/search/geo-matching";
import { rankActivities, rankRestaurants } from "../lib/search/ranking";
import { buildOutingPairs } from "../lib/search/pairing";

function hay(record: any) {
  return [record.name, record.restaurant_name, record.activity_name, record.neighborhood, record.borough, record.city, record.cuisine, record.activity_type, record.search_document].join(" ").toLowerCase();
}

function assertSeparated(query: string, food: string[], activity: string[]) {
  const intent = parseCanonicalIntent(query, {
    intent: {
      restaurantTerms: food,
      activityTerms: activity,
    },
  });
  intent.restaurantSearchInput = buildRestaurantSearchInput(intent);
  intent.activitySearchInput = buildActivitySearchInput(intent);
  for (const term of food) {
    assert.match(`${intent.normalizedIntent?.restaurantTerms.join(" ")} ${intent.restaurantSearchInput}`, new RegExp(term, "i"));
    assert.doesNotMatch(intent.activitySearchInput, new RegExp(term, "i"), `${query}: activity lane included food term ${term}`);
  }
  for (const term of activity) {
    assert.match(`${intent.normalizedIntent?.activityTerms.join(" ")} ${intent.activitySearchInput}`, new RegExp(term, "i"));
    assert.doesNotMatch(intent.restaurantSearchInput, new RegExp(term, "i"), `${query}: restaurant lane included activity term ${term}`);
  }
  return intent;
}

const astoria = assertSeparated("steak dinner with bowling in Astoria", ["steak", "dinner"], ["bowling"]);
assert.equal(astoria.primaryDomain, "mixed");
assert.equal(astoria.wantsPairing, true);
assert.equal(astoria.needsRestaurant, true);
assert.equal(astoria.needsActivity, true);
assert.equal(astoria.normalizedIntent?.geo.neighborhood, "astoria");
assert.equal(astoria.normalizedIntent?.geo.borough, "queens");
assert.match(astoria.restaurantSearchInput, /steak/);
assert.match(astoria.restaurantSearchInput, /dinner/);
assert.match(astoria.restaurantSearchInput, /astoria/);
assert.match(astoria.restaurantSearchInput, /queens/);
assert.doesNotMatch(astoria.restaurantSearchInput, /bowling/);
assert.match(astoria.activitySearchInput, /bowling/);
assert.doesNotMatch(astoria.activitySearchInput, /steak|dinner/);

const steakRestaurants = rankRestaurants([
  { name: "Astoria Prime Steak", restaurant_name: "Astoria Prime Steak", cuisine: "steakhouse", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", search_document: "steakhouse dinner restaurant ribeye" },
  { name: "Brooklyn Random Steak", restaurant_name: "Brooklyn Random Steak", cuisine: "steakhouse", neighborhood: "Williamsburg", borough: "Brooklyn", city: "New York", state: "NY", search_document: "steak dinner restaurant" },
  { name: "NJ Bowling Bar", activity_name: "NJ Bowling Bar", activity_type: "bowling", city: "Hoboken", state: "NJ", search_document: "bowling lanes" },
], astoria);
assert.match(hay(steakRestaurants[0]), /astoria|queens/);
assert.match(hay(steakRestaurants[0]), /steak|ribeye|steakhouse/);

const bowlingActivities = rankActivities([
  { name: "Astoria Bowl", activity_name: "Astoria Bowl", activity_type: "bowling", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", search_document: "bowling alley lanes bowl" },
  { name: "Manhattan Karaoke", activity_name: "Manhattan Karaoke", activity_type: "karaoke", neighborhood: "Midtown", borough: "Manhattan", city: "New York", state: "NY", search_document: "karaoke rooms" },
  { name: "Brooklyn Bowl", activity_name: "Brooklyn Bowl", activity_type: "bowling", neighborhood: "Williamsburg", borough: "Brooklyn", city: "New York", state: "NY", search_document: "bowling alley" },
], astoria);
assert.match(hay(bowlingActivities[0]), /astoria|queens/);
assert.match(hay(bowlingActivities[0]), /bowling|lanes|bowl/);
assert.ok(scoreGeoMatch(bowlingActivities[0], astoria.geoIntent) > scoreGeoMatch(bowlingActivities[1], astoria.geoIntent));

const pairs = buildOutingPairs(steakRestaurants, bowlingActivities, astoria);
assert.ok(pairs.length > 0);
assert.match(hay(pairs[0].restaurant), /astoria|queens/);
assert.match(hay(pairs[0].activity), /astoria|queens/);

const manhattan = assertSeparated("sushi then karaoke in Manhattan", ["sushi"], ["karaoke"]);
assert.equal(manhattan.normalizedIntent?.geo.borough, "manhattan");
assert.doesNotMatch(manhattan.restaurantSearchInput, /karaoke/);
assert.doesNotMatch(manhattan.activitySearchInput, /sushi/);

const lic = assertSeparated("rooftop dinner with bowling in Long Island City", ["rooftop", "dinner"], ["bowling"]);
assert.equal(lic.normalizedIntent?.geo.neighborhood, "long island city");
assert.equal(lic.normalizedIntent?.geo.borough, "queens");
assert.notEqual(lic.normalizedIntent?.geo.region, "long_island");
assert.doesNotMatch(lic.activitySearchInput, /dinner/);
assert.doesNotMatch(lic.restaurantSearchInput, /bowling/);

const things = parseCanonicalIntent("things to do in Queens", {});
things.restaurantSearchInput = buildRestaurantSearchInput(things);
things.activitySearchInput = buildActivitySearchInput(things);
assert.equal(things.needsRestaurant, false);
assert.equal(things.needsActivity, true);
assert.equal(things.primaryDomain, "activity");
assert.match(things.activitySearchInput, /queens/);

const badLlm = parseCanonicalIntent("steak dinner with bowling in Astoria", {
  intent: { restaurantTerms: ["steak dinner bowling"], activityTerms: [], geo: { neighborhood: "Astoria" } },
});
badLlm.restaurantSearchInput = buildRestaurantSearchInput(badLlm);
badLlm.activitySearchInput = buildActivitySearchInput(badLlm);
assert.ok(badLlm.normalizedIntent?.restaurantTerms.includes("steak"));
assert.ok(badLlm.normalizedIntent?.activityTerms.includes("bowling"));
assert.doesNotMatch(badLlm.restaurantSearchInput, /bowling/);
assert.doesNotMatch(badLlm.activitySearchInput, /steak|dinner/);

const geoAstoria = detectRequestedGeo("steak dinner in Astoria");
assert.equal(geoAstoria?.neighborhood, "astoria");
assert.equal(geoAstoria?.borough, "queens");
const geoLic = detectRequestedGeo("rooftop dinner in Long Island City");
assert.equal(geoLic?.neighborhood, "long island city");
assert.equal(geoLic?.borough, "queens");
assert.notEqual(geoLic?.region, "long_island");

console.log("search quality lane regression passed");
