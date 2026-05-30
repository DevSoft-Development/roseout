import * as assert from "node:assert/strict";
import { parseCanonicalIntent } from "../lib/search/intent";
import { detectRequestedGeo, scoreGeoMatch } from "../lib/search/geo-matching";
import { rankActivities, rankRestaurants } from "../lib/search/ranking";

const cases = [
  "steak dinner and hookah in Queens",
  "steak dinner in Queens",
  "rooftop dinner in Manhattan",
  "hookah in Brooklyn",
  "brunch in Long Island City",
  "seafood dinner and hookah in Astoria",
  "brunch in Brooklyn",
  "romantic dinner in Manhattan",
  "bowling and dinner in Queens",
  "sip and paint after dinner",
  "rooftop lounge after dinner in Manhattan",
  "coffee date in Brooklyn",
  "dessert after dinner in Queens",
] as const;

for (const query of cases) {
  const intent = parseCanonicalIntent(query, { message: query });
  console.log(query, {
    foodIntent: intent.foodIntent,
    activityIntent: intent.activityIntent,
    locationIntent: intent.locationIntent,
    borough: intent.borough,
    city: intent.city,
    neighborhood: intent.neighborhood,
    needsRestaurant: intent.needsRestaurant,
    needsActivity: intent.needsActivity,
    wantsPairing: intent.wantsPairing,
    addOnIntent: intent.addOnIntent,
  });
}

const steakHookah = parseCanonicalIntent("steak dinner and hookah in Queens");
assert.equal(steakHookah.needsRestaurant, true);
assert.equal(steakHookah.needsActivity, true);
assert.ok(steakHookah.foodIntent.includes("steak"));
assert.ok(steakHookah.activityIntent.includes("hookah"));

const steakQueens = parseCanonicalIntent("steak dinner in Queens");
assert.equal(steakQueens.needsRestaurant, true);
assert.equal(steakQueens.needsActivity, false);
assert.equal(steakQueens.borough, "queens");
assert.ok(steakQueens.foodIntent.includes("steak"));

const rooftopManhattan = parseCanonicalIntent("rooftop dinner in Manhattan");
assert.equal(rooftopManhattan.needsRestaurant, true);
assert.equal(rooftopManhattan.needsActivity, false);
assert.equal(rooftopManhattan.borough, "manhattan");
assert.ok(rooftopManhattan.vibes.includes("rooftop"));

const hookahBrooklyn = parseCanonicalIntent("hookah in Brooklyn");
assert.equal(hookahBrooklyn.needsRestaurant, false);
assert.equal(hookahBrooklyn.needsActivity, true);
assert.equal(hookahBrooklyn.borough, "brooklyn");
assert.ok(hookahBrooklyn.activityIntent.includes("hookah"));

const brunchLic = parseCanonicalIntent("brunch in Long Island City");
assert.equal(brunchLic.needsRestaurant, true);
assert.equal(brunchLic.needsActivity, false);
assert.equal(brunchLic.neighborhood, "long island city");
assert.equal(brunchLic.borough, "queens");

const brunchBrooklyn = parseCanonicalIntent("brunch in Brooklyn");
assert.equal(brunchBrooklyn.needsRestaurant, true);
assert.equal(brunchBrooklyn.needsActivity, false);

const bowlingDinner = parseCanonicalIntent("bowling and dinner in Queens");
assert.equal(bowlingDinner.needsRestaurant, true);
assert.equal(bowlingDinner.needsActivity, true);
assert.equal(bowlingDinner.wantsPairing, true);

const queensGeo = detectRequestedGeo("steak dinner in Queens");
assert.ok(queensGeo);
assert.ok(
  scoreGeoMatch({ name: "Queens Steakhouse", borough: "Queens", city: "New York", state: "NY" }, queensGeo) >
    scoreGeoMatch({ name: "Brooklyn Steakhouse", borough: "Brooklyn", city: "New York", state: "NY" }, queensGeo),
  "Exact borough matches must outrank wrong borough matches.",
);

const licGeo = detectRequestedGeo("brunch in Long Island City");
assert.ok(licGeo);
assert.ok(
  scoreGeoMatch({ name: "LIC Brunch", neighborhood: "Long Island City", borough: "Queens", city: "New York", state: "NY" }, licGeo) >
    scoreGeoMatch({ name: "Queens Brunch", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY" }, licGeo),
  "Exact neighborhood matches must outrank same-borough fallback matches.",
);

const rankedSteak = rankRestaurants(
  [
    { name: "Brooklyn Steakhouse", borough: "Brooklyn", city: "New York", state: "NY", restaurant_name: "Brooklyn Steakhouse", cuisine: "steakhouse", search_document: "steak dinner restaurant" },
    { name: "Queens Steakhouse", borough: "Queens", city: "New York", state: "NY", restaurant_name: "Queens Steakhouse", cuisine: "steakhouse", search_document: "steak dinner restaurant" },
    { name: "Queens Hookah", borough: "Queens", city: "New York", state: "NY", activity_name: "Queens Hookah", primary_category: "hookah lounge", search_document: "hookah lounge activity" },
  ],
  steakQueens,
);
assert.equal(rankedSteak[0].name, "Queens Steakhouse");

const rankedRooftop = rankRestaurants(
  [
    { name: "Brooklyn Rooftop", borough: "Brooklyn", city: "New York", state: "NY", restaurant_name: "Brooklyn Rooftop", cuisine: "restaurant", search_document: "rooftop dinner terrace" },
    { name: "Manhattan Rooftop", borough: "Manhattan", city: "New York", state: "NY", restaurant_name: "Manhattan Rooftop", cuisine: "restaurant", search_document: "rooftop dinner skyline terrace" },
  ],
  rooftopManhattan,
);
assert.equal(rankedRooftop[0].name, "Manhattan Rooftop");

const rankedHookah = rankActivities(
  [
    { name: "Queens Hookah", borough: "Queens", city: "New York", state: "NY", activity_name: "Queens Hookah", primary_category: "hookah lounge", search_document: "hookah lounge activity" },
    { name: "Brooklyn Hookah", borough: "Brooklyn", city: "New York", state: "NY", activity_name: "Brooklyn Hookah", primary_category: "hookah lounge", search_document: "hookah lounge activity" },
  ],
  hookahBrooklyn,
);
assert.equal(rankedHookah[0].name, "Brooklyn Hookah");

console.log("search-production-readiness regression passed");
