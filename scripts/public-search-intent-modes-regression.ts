import assert from "node:assert/strict";
import { normalizeIntent } from "../lib/search/enterprise/normalize-intent";
import { scoreGeoMatch } from "../lib/search/enterprise/geo-taxonomy";
import type { EnterpriseLocation } from "../lib/search/enterprise/types";

function expectMode(query: string, expected: { searchType: string; sameLocationRequired: boolean; wantsPairing: boolean; needsRestaurant: boolean; needsActivity: boolean }) {
  const intent = normalizeIntent(query);
  assert.equal(intent.searchType, expected.searchType, `${query} searchType`);
  assert.equal(Boolean(intent.sameLocationRequired), expected.sameLocationRequired, `${query} sameLocationRequired`);
  assert.equal(intent.wantsPairing, expected.wantsPairing, `${query} wantsPairing`);
  assert.equal(intent.needsRestaurant, expected.needsRestaurant, `${query} needsRestaurant`);
  assert.equal(intent.needsActivity, expected.needsActivity, `${query} needsActivity`);
  return intent;
}

const combo = expectMode("dinner with hookah in manhattan", {
  searchType: "same_location_combo",
  sameLocationRequired: true,
  wantsPairing: false,
  needsRestaurant: true,
  needsActivity: false,
});
expectMode("restaurant with hookah in Manhattan", { searchType: "same_location_combo", sameLocationRequired: true, wantsPairing: false, needsRestaurant: true, needsActivity: false });
expectMode("dinner and hookah close by in manhattan", { searchType: "mixed_outing", sameLocationRequired: false, wantsPairing: true, needsRestaurant: true, needsActivity: true });
expectMode("hookah after dinner", { searchType: "mixed_outing", sameLocationRequired: false, wantsPairing: true, needsRestaurant: true, needsActivity: true });
expectMode("hookah lounge in Manhattan", { searchType: "activity", sameLocationRequired: false, wantsPairing: false, needsRestaurant: false, needsActivity: true });
expectMode("seafood rooftop restaurant", { searchType: "restaurant", sameLocationRequired: true, wantsPairing: false, needsRestaurant: true, needsActivity: false });
expectMode("Italian dinner with live music", { searchType: "same_location_combo", sameLocationRequired: true, wantsPairing: false, needsRestaurant: true, needsActivity: false });
expectMode("Italian dinner with live music nearby", { searchType: "mixed_outing", sameLocationRequired: false, wantsPairing: true, needsRestaurant: true, needsActivity: true });
expectMode("dinner then rooftop drinks", { searchType: "mixed_outing", sameLocationRequired: false, wantsPairing: true, needsRestaurant: true, needsActivity: true });
const rooftopQueens = normalizeIntent("rooftop dinner in Queens");
assert.notEqual(rooftopQueens.searchType, "paired_outing");
assert.equal(rooftopQueens.wantsPairing, false);

for (const query of [
  "Give me a sports bar with wings and TVs for the Knicks game, all at the same place.",
  "I want wings and a bar where I can watch the Knicks game, not a restaurant plus a separate activity.",
  "I want a bar and grill with chicken wings where we can watch basketball, not just a lounge.",
]) {
  const intent = normalizeIntent(query);
  assert(["restaurant", "same_location_combo"].includes(intent.searchType), `${query} same-location searchType`);
  assert.equal(intent.primaryDomain, "restaurant", `${query} primaryDomain`);
  assert.equal(intent.needsRestaurant, true, `${query} needsRestaurant`);
  assert.equal(intent.needsActivity, false, `${query} needsActivity`);
  assert.equal(intent.wantsPairing, false, `${query} wantsPairing`);
  assert.equal(Boolean(intent.sameVenuePreferred), true, `${query} sameVenuePreferred`);
  assert.equal(Boolean(intent.fallbackPairAllowed), false, `${query} fallbackPairAllowed`);
  assert(["same_location_combo", "restaurant_only"].includes(String(intent.normalizedIntent)), `${query} normalizedIntent`);
}

const nearbySportsBar = normalizeIntent("Find a sports bar nearby.");
assert.equal(nearbySportsBar.wantsPairing, false, "sports bar nearby should not pair");
assert.notEqual(nearbySportsBar.searchType, "mixed_outing", "sports bar nearby should not be mixed_outing");

const dinnerBowling = normalizeIntent("Find dinner and bowling nearby.");
assert.equal(dinnerBowling.searchType, "mixed_outing", "dinner and bowling should remain mixed outing");
assert.equal(dinnerBowling.needsRestaurant, true);
assert.equal(dinnerBowling.needsActivity, true);
assert.equal(dinnerBowling.wantsPairing, true);

const manhattan: EnterpriseLocation = { id: "m", name: "Manhattan Hookah Restaurant", borough: "Manhattan", city: "New York", state: "NY" };
const queens: EnterpriseLocation = { id: "q", name: "Queens Hookah Restaurant", borough: "Queens", city: "New York", state: "NY" };
assert(scoreGeoMatch(manhattan, combo.geo) > scoreGeoMatch(queens, combo.geo), "Manhattan should outrank Queens for explicit Manhattan query");

console.log("public-search-intent-modes-regression passed");
