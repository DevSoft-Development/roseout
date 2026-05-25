import * as assert from "node:assert/strict";
import { parseSearchIntent, buildRestaurantSearchInput, buildActivitySearchInput } from "../lib/searchIntent";

const cases = [
  { q: "Steak dinner and hookah lounge in Queens", check: (i: any) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); assert.ok(buildRestaurantSearchInput(i).includes("steak")); assert.ok(buildActivitySearchInput(i).includes("hookah")); assert.equal(i.hardFilters.borough, "Queens"); } },
  { q: "Seafood dinner and hookah in Queens", check: (i: any) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); } },
  { q: "Hookah lounge in Queens", check: (i: any) => { assert.equal(i.wantsRestaurant, false); assert.equal(i.wantsActivity, true); } },
  { q: "Dessert after dinner in Queens", check: (i: any) => { assert.equal(i.wantsRestaurant, true); } },
  { q: "Steak restaurant in Queens", check: (i: any) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, false); } },
  { q: "Steak dinner and hookah lounge after dinner in Astoria", check: (i: any) => { assert.equal(i.wantsRestaurant, true); assert.equal(i.wantsActivity, true); assert.ok(i.locations.includes("astoria")); } },
];
for (const c of cases) c.check(parseSearchIntent(c.q, {}));
console.log("search intent regression checks passed");
