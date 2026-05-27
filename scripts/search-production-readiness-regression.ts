import * as assert from "node:assert/strict";
import { parseCanonicalIntent } from "../lib/search/intent";

const cases = [
  "steak dinner and hookah in Queens",
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

const brunchBrooklyn = parseCanonicalIntent("brunch in Brooklyn");
assert.equal(brunchBrooklyn.needsRestaurant, true);
assert.equal(brunchBrooklyn.needsActivity, false);

const bowlingDinner = parseCanonicalIntent("bowling and dinner in Queens");
assert.equal(bowlingDinner.needsRestaurant, true);
assert.equal(bowlingDinner.needsActivity, true);
assert.equal(bowlingDinner.wantsPairing, true);

console.log("search-production-readiness intent regression passed");
