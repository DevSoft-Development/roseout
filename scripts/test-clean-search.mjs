import assert from "node:assert/strict";
import { parseCanonicalIntent } from "../lib/search/intent.ts";
import { buildActivitySearchInput, buildRestaurantSearchInput } from "../lib/search/queryBuilders.ts";

const cases = [
  ["Steak dinner and hookah lounge after dinner in Queens", (i) => {
    assert.equal(i.isOffTopic, false); assert.ok(i.mealFoodIntents.includes("steak")); assert.ok(i.activityIntents.includes("hookah"));
    i.restaurantSearchInput = buildRestaurantSearchInput(i); i.activitySearchInput = buildActivitySearchInput(i);
    assert.equal(i.restaurantSearchInput.includes("hookah"), false); assert.equal(i.activitySearchInput.includes("hookah"), true);
  }],
  ["Steak dinner and sip and paint", (i) => {
    assert.equal(i.isOffTopic, false); assert.ok(i.mealFoodIntents.includes("steak")); assert.ok(i.activityIntents.includes("paint_and_sip"));
    i.restaurantSearchInput = buildRestaurantSearchInput(i); i.activitySearchInput = buildActivitySearchInput(i);
    assert.equal(/paint|sip/.test(i.restaurantSearchInput), false); assert.equal(i.activitySearchInput.includes("paint and sip"), true);
  }],
  ["Seafood dinner and hookah in Queens", (i) => { assert.ok(i.mealFoodIntents.includes("seafood")); assert.ok(i.activityIntents.includes("hookah")); }],
  ["Brunch and bowling in Brooklyn", (i) => { assert.ok(i.mealFoodIntents.includes("brunch")); assert.ok(i.activityIntents.includes("bowling")); assert.equal(i.wantsFullOuting, true); }],
  ["Dessert after dinner", (i) => { assert.ok(i.addOnFoodIntents.includes("dessert")); assert.equal(i.activityIntents.length, 0); }],
  ["Hookah lounge in Queens", (i) => { assert.ok(i.activityIntents.includes("hookah")); assert.equal(i.wantsActivity, true); }],
  ["Restaurant with hookah in Queens", (i) => { assert.equal(i.wantsRestaurant, true); }],
  ["romantic rooftop dinner in Manhattan", (i) => {
    i.restaurantSearchInput = buildRestaurantSearchInput(i); i.activitySearchInput = buildActivitySearchInput(i);
    assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.equal(i.wantsPairing, false);
    assert.equal(i.activityIntents.includes("rooftop"), false); assert.ok(i.vibes.includes("rooftop")); assert.ok(i.vibes.includes("romantic"));
    assert.equal(i.borough, "manhattan"); assert.ok(i.restaurantSearchInput.includes("dinner")); assert.ok(i.restaurantSearchInput.includes("manhattan")); assert.ok(i.restaurantSearchInput.includes("rooftop"));
    assert.equal(i.activitySearchInput.includes("rooftop"), false);
  }],
  ["steak dinner in Queens", (i) => { assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.equal(i.borough, "queens"); }],
  ["seafood dinner in Brooklyn", (i) => { assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.equal(i.borough, "brooklyn"); }],
  ["rooftop bar in Manhattan", (i) => {
    i.activitySearchInput = buildActivitySearchInput(i);
    assert.ok(i.activityIntents.includes("rooftop")); assert.equal(i.needsActivity, true); assert.equal(i.borough, "manhattan"); assert.ok(i.activitySearchInput.includes("rooftop"));
  }],
];

for (const [q, check] of cases) {
  const intent = parseCanonicalIntent(q);
  check(intent);
}

console.log("clean-search intent tests passed");
