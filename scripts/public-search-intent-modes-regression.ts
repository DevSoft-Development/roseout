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
  needsActivity: true,
});
expectMode("restaurant with hookah in Manhattan", { searchType: "same_location_combo", sameLocationRequired: true, wantsPairing: false, needsRestaurant: true, needsActivity: true });
expectMode("dinner and hookah close by in manhattan", { searchType: "paired_outing", sameLocationRequired: false, wantsPairing: true, needsRestaurant: true, needsActivity: true });
expectMode("hookah after dinner", { searchType: "paired_outing", sameLocationRequired: false, wantsPairing: true, needsRestaurant: true, needsActivity: true });
expectMode("hookah lounge in Manhattan", { searchType: "activity", sameLocationRequired: false, wantsPairing: false, needsRestaurant: false, needsActivity: true });
expectMode("seafood rooftop restaurant", { searchType: "restaurant", sameLocationRequired: false, wantsPairing: false, needsRestaurant: true, needsActivity: false });
expectMode("Italian dinner with live music", { searchType: "same_location_combo", sameLocationRequired: true, wantsPairing: false, needsRestaurant: true, needsActivity: true });
expectMode("Italian dinner with live music nearby", { searchType: "paired_outing", sameLocationRequired: false, wantsPairing: true, needsRestaurant: true, needsActivity: true });
expectMode("dinner then rooftop drinks", { searchType: "paired_outing", sameLocationRequired: false, wantsPairing: true, needsRestaurant: true, needsActivity: true });
const rooftopQueens = normalizeIntent("rooftop dinner in Queens");
assert.notEqual(rooftopQueens.searchType, "paired_outing");
assert.equal(rooftopQueens.wantsPairing, false);

const manhattan: EnterpriseLocation = { id: "m", name: "Manhattan Hookah Restaurant", borough: "Manhattan", city: "New York", state: "NY" };
const queens: EnterpriseLocation = { id: "q", name: "Queens Hookah Restaurant", borough: "Queens", city: "New York", state: "NY" };
assert(scoreGeoMatch(manhattan, combo.geo) > scoreGeoMatch(queens, combo.geo), "Manhattan should outrank Queens for explicit Manhattan query");

console.log("public-search-intent-modes-regression passed");
