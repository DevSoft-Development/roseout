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
];
for (const c of cases) c.check(parseSearchIntent(c.q, {}));
console.log("search intent regression checks passed");
