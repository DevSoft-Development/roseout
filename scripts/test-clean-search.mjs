import assert from "node:assert/strict";
import { parseCanonicalIntent } from "../.tmp-clean/intent.js";

const q1 = parseCanonicalIntent("Steak dinner and hookah lounge after dinner in Queens");
assert.equal(q1.isOffTopic, false);
assert.ok(q1.mealFoodIntents.includes("steak"));
assert.ok(q1.activityIntents.includes("hookah"));
assert.ok(!q1.restaurantSearchInput.includes("hookah"));
assert.ok(q1.activitySearchInput.includes("hookah"));

const q2 = parseCanonicalIntent("Steak dinner and sip and paint");
assert.equal(q2.isOffTopic, false);
assert.ok(q2.mealFoodIntents.includes("steak"));
assert.ok(q2.activityIntents.includes("paint_and_sip"));

const q3 = parseCanonicalIntent("Seafood dinner and hookah in Queens");
assert.ok(q3.mealFoodIntents.includes("seafood"));
assert.ok(q3.activityIntents.includes("hookah"));

const q4 = parseCanonicalIntent("Brunch and bowling in Brooklyn");
assert.ok(q4.mealFoodIntents.includes("brunch"));
assert.ok(q4.activityIntents.includes("bowling"));
assert.equal(q4.wantsFullOuting, true);

const q5 = parseCanonicalIntent("Dessert after dinner");
assert.ok(q5.addOnFoodIntents.includes("dessert"));
assert.ok(!q5.activityIntents.includes("dessert"));

const q6 = parseCanonicalIntent("Hookah lounge in Queens");
assert.ok(q6.activityIntents.includes("hookah"));
assert.equal(q6.wantsActivity, true);

const q7 = parseCanonicalIntent("Restaurant with hookah in Queens");
assert.equal(q7.wantsRestaurant, true);

console.log("clean-search intent tests passed");
