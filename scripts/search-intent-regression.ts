import * as assert from "node:assert/strict";
import { parseSearchIntent, buildRestaurantSearchInput, buildActivitySearchInput } from "../lib/searchIntent";

const cases = [
  { q: "steak dinner and hookah lounge in Queens", check: (i: any) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); assert.ok(buildRestaurantSearchInput(i).includes("steak")); assert.ok(buildActivitySearchInput(i).includes("hookah")); assert.equal(i.hardFilters.borough, "Queens"); } },
  { q: "seafood dinner and hookah in Queens", check: (i: any) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); } },
  { q: "dinner and dessert in Queens", check: (i: any) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); assert.ok(buildActivitySearchInput(i).includes("dessert")); } },
  { q: "restaurant and bowling in Brooklyn", check: (i: any) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); assert.ok(buildActivitySearchInput(i).includes("bowling")); } },
  { q: "brunch and rooftop lounge in Manhattan", check: (i: any) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); } },
  { q: "hookah lounge only in Queens", check: (i: any) => { assert.equal(i.wantsRestaurant, false); assert.equal(i.wantsActivity, true); } },
  { q: "Steak restaurant in Queens", check: (i: any) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, false); } },
  { q: "things to do in Queens", check: (i: any) => { assert.equal(i.wantsRestaurant, false); assert.equal(i.wantsActivity, true); } },
  { q: "romantic rooftop dinner in Manhattan", check: (i: any) => { assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.equal(i.wantsPairing, false); assert.equal(i.activityIntents.includes("rooftop"), false); assert.ok(i.vibes.includes("rooftop")); assert.ok(buildRestaurantSearchInput(i).includes("rooftop")); assert.equal(buildActivitySearchInput(i).includes("rooftop"), false); assert.equal(i.hardFilters.borough, "Manhattan"); } },
  { q: "steak dinner in Queens", check: (i: any) => { assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.equal(i.hardFilters.borough, "Queens"); } },
  { q: "hookah lounge in Queens", check: (i: any) => { assert.equal(i.needsRestaurant, false); assert.equal(i.needsActivity, true); assert.equal(i.hardFilters.borough, "Queens"); } },
  { q: "seafood dinner in Brooklyn", check: (i: any) => { assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.equal(i.hardFilters.borough, "Brooklyn"); } },
  { q: "rooftop bar in Manhattan", check: (i: any) => { assert.ok(i.activityIntents.includes("rooftop")); assert.equal(i.needsActivity, true); assert.equal(i.hardFilters.borough, "Manhattan"); assert.ok(buildActivitySearchInput(i).includes("rooftop")); } },
];
for (const c of cases) c.check(parseSearchIntent(c.q, {}));
console.log("search intent regression checks passed");
