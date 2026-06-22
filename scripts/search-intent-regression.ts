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
  { q: "Mediterranean Dinner with hookah in Manhattan", check: (i: any) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.sequenceDetected, false); assert.equal(i.proximityDetected, false); assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.equal(i.wantsPairing, false); assert.equal(i.primaryDomain, "restaurant"); assert.ok(buildRestaurantSearchInput(i).includes("hookah")); assert.ok(buildRestaurantSearchInput(i).includes("mediterranean")); } },
  { q: "restaurant with live music", check: (i: any) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, false); assert.ok(buildRestaurantSearchInput(i).includes("live music")); } },
  { q: "dinner with rooftop views", check: (i: any) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.needsRestaurant, true); assert.equal(i.wantsPairing, false); } },
  { q: "brunch with bottomless mimosas", check: (i: any) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.needsRestaurant, true); assert.ok(buildRestaurantSearchInput(i).includes("mimosas")); } },
  { q: "coffee shop with outdoor seating", check: (i: any) => { assert.equal(i.sameVenuePreferred, true); assert.ok(buildRestaurantSearchInput(i).includes("outdoor")); } },
  { q: "bar with games", check: (i: any) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.wantsPairing, false); } },
  { q: "activity with drinks", check: (i: any) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.needsActivity, true); assert.equal(i.wantsPairing, false); assert.ok(buildActivitySearchInput(i).includes("drinks")); } },
  { q: "hookah lounge with food near me", check: (i: any) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.proximityDetected, false); assert.equal(i.wantsPairing, false); } },
  { q: "restaurant with live music near me", check: (i: any) => { assert.equal(i.sameVenuePreferred, true); assert.equal(i.proximityDetected, false); assert.equal(i.needsActivity, false); } },
  { q: "Mediterranean dinner and hookah after in Manhattan", check: (i: any) => { assert.equal(i.sameVenuePreferred, false); assert.equal(i.sequenceDetected, true); assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, true); assert.equal(i.primaryDomain, "mixed"); } },
  { q: "dinner then hookah in Queens", check: (i: any) => { assert.equal(i.sequenceDetected, true); assert.equal(i.needsRestaurant, true); assert.equal(i.needsActivity, true); } },
  { q: "dinner followed by hookah", check: (i: any) => { assert.equal(i.sequenceDetected, true); assert.equal(i.primaryDomain, "mixed"); } },
  { q: "dinner near a hookah lounge", check: (i: any) => { assert.equal(i.proximityDetected, true); assert.equal(i.primaryDomain, "mixed"); } },
  { q: "restaurant near live music", check: (i: any) => { assert.equal(i.proximityDetected, true); assert.equal(i.sameVenuePreferred, false); } },
];
for (const c of cases) c.check(parseSearchIntent(c.q, {}));
console.log("search intent regression checks passed");
