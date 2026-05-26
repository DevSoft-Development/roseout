import assert from "node:assert/strict";
import { parseCanonicalIntent } from "../lib/search/intent";
import { buildRestaurantSearchInput } from "../lib/search/queryBuilders";
import { rankRestaurants } from "../lib/search/ranking";

function textOf(r: any) {
  return [r.name, r.restaurant_name, r.primary_category, r.cuisine, r.cuisine_type, r.search_document].map((v) => String(v ?? "").toLowerCase()).join(" ");
}

const steakIntent = parseCanonicalIntent("steak dinner");
assert.ok(steakIntent.specificMealFoodIntents.includes("steak"));
const steakInput = buildRestaurantSearchInput(steakIntent);
assert.equal(steakInput.includes("dinner"), false);

const queensSteakIntent = parseCanonicalIntent("steak dinner in Queens");
const queensInput = buildRestaurantSearchInput(queensSteakIntent);
assert.ok(queensInput.includes("queens"));
assert.ok(queensInput.includes("steak"));

const seafoodIntent = parseCanonicalIntent("seafood dinner");
assert.ok(seafoodIntent.specificMealFoodIntents.includes("seafood"));

const genericIntent = parseCanonicalIntent("dinner in Queens");
assert.equal(genericIntent.specificMealFoodIntents.length, 0);

const records = [
  { name: "Prime Steakhouse", primary_category: "steakhouse", cuisine: "steak", search_document: "best steak dinner" },
  { name: "Queens Bakery Cafe", primary_category: "bakery", cuisine: "dessert", search_document: "dinner specials" },
  { name: "Ocean Catch", primary_category: "seafood", cuisine: "seafood", search_document: "fresh fish" },
];

const rankedSteak = rankRestaurants(records, steakIntent);
assert.equal(rankedSteak[0].name, "Prime Steakhouse");
assert.ok(textOf(rankedSteak[0]).includes("steak"));

const rankedSeafood = rankRestaurants(records, seafoodIntent);
assert.equal(rankedSeafood[0].name, "Ocean Catch");

const comboIntent = parseCanonicalIntent("steak dinner and hookah lounge after dinner in Queens");
assert.ok(comboIntent.specificMealFoodIntents.includes("steak"));
assert.ok(comboIntent.activityIntents.includes("hookah"));

console.log("strict food regression checks passed");
