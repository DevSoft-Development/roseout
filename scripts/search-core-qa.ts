import assert from "node:assert/strict";
import { toDisplayLabel } from "../lib/displayLabel";
import { detectRequestedGeo } from "../lib/search/geo-matching";
import { parseCanonicalIntent } from "../lib/search/intent";
import { formatDistanceFromRestaurant } from "../lib/search/enterprise/distance";
import { normalizeIntent } from "../lib/search/enterprise/normalize-intent";
import { rankActivityResults, rankRestaurantResults } from "../lib/search/enterprise/ranking";
import { qualityRankingRestaurants, rooftopRankingActivities } from "./fixtures/search-core-fixtures";

type SearchHealthFixture = {
  restaurant_count: number;
  activity_count: number;
  pair_count: number;
  distanceMode?: string | null;
  no_pairs_reason?: string | null;
  needsRestaurant?: boolean;
  needsActivity?: boolean;
  wantsPairing?: boolean;
};

function classifySearchHealthFixture(event: SearchHealthFixture) {
  const needsRestaurant = event.needsRestaurant ?? true;
  const needsActivity = event.needsActivity ?? false;
  const wantsPairing = event.wantsPairing ?? true;
  const walkingMode = ["walking", "short_walk", "walk"].includes(String(event.distanceMode ?? "").toLowerCase());

  if (event.restaurant_count === 0 && needsRestaurant) {
    return { event_type: "no_restaurant_results", severity: "warning", event_label: "No restaurant results" };
  }

  if (event.activity_count === 0 && needsActivity) {
    return { event_type: "no_activity_results", severity: "warning", event_label: "No activity results" };
  }

  if (wantsPairing && event.restaurant_count > 0 && event.activity_count > 0 && event.pair_count === 0) {
    return walkingMode || event.no_pairs_reason === "no_pairs_within_walking_distance"
      ? { event_type: "no_valid_pairs", severity: "warning", event_label: "No valid pairs within walking distance" }
      : { event_type: "no_valid_pairs", severity: "warning", event_label: "No valid pairs found" };
  }

  return { event_type: "search_event", severity: "info", event_label: "Search event" };
}

function assertCanonicalIntent() {
  const steakQueens = parseCanonicalIntent("steak dinner in Queens");
  assert.equal(steakQueens.primaryDomain, "restaurant");
  assert.equal(steakQueens.needsRestaurant, true);
  assert.equal(steakQueens.needsActivity, false);
  assert.equal(steakQueens.geoIntent?.borough, "queens");

  const hookahAstoria = parseCanonicalIntent("hookah lounge in Astoria");
  assert.equal(hookahAstoria.primaryDomain, "activity");
  assert.equal(hookahAstoria.needsActivity, true);
  assert.equal(hookahAstoria.hookahMode, "activity");
  assert.equal(hookahAstoria.geoIntent?.neighborhood, "astoria");
  assert.equal(hookahAstoria.geoIntent?.borough, "queens");

  const brunchPaint = parseCanonicalIntent("brunch and sip and paint");
  assert.equal(brunchPaint.primaryDomain, "mixed");
  assert.equal(brunchPaint.wantsPairing, true);
  assert.equal(brunchPaint.needsRestaurant, true);
  assert.equal(brunchPaint.needsActivity, true);
  assert(brunchPaint.activityIntents.includes("paint_and_sip"));

  const steakHookah = parseCanonicalIntent("steak dinner and hookah lounge");
  assert.equal(steakHookah.primaryDomain, "mixed");
  assert.equal(steakHookah.wantsPairing, true);
  assert.equal(steakHookah.hookahMode, "activity_add_on");
}

function assertPairingPreferenceAndGeo() {
  const query = "steak dinner and rooftop drinks 1 minute walk apart in Queens";
  const enterpriseIntent = normalizeIntent(query);
  const canonicalGeo = detectRequestedGeo(query);

  assert.equal(enterpriseIntent.pairingPreference?.distanceMode, "walking");
  assert.equal(enterpriseIntent.pairingPreference?.maxPairWalkingMinutes, 1);
  assert.equal(enterpriseIntent.pairingPreference?.maxPairDistanceMiles, 0.1);
  assert.equal(canonicalGeo?.borough, "queens");
}

function assertSearchHealthClassification() {
  const classified = classifySearchHealthFixture({
    restaurant_count: 6,
    activity_count: 12,
    pair_count: 0,
    distanceMode: "walking",
    no_pairs_reason: "no_pairs_within_walking_distance",
    needsRestaurant: true,
    needsActivity: true,
    wantsPairing: true,
  });

  assert.equal(classified.event_type, "no_valid_pairs");
  assert.equal(classified.severity, "warning");
  assert.equal(classified.event_label, "No valid pairs within walking distance");
}

function assertLabels() {
  assert.equal(toDisplayLabel("Fine_dining"), "Fine Dining");
  assert.equal(toDisplayLabel("rooftop_bar"), "Rooftop Bar");

  assert.equal(
    formatDistanceFromRestaurant({
      pair: { pairDistanceMiles: 0.4, walkingDurationMinutes: null },
      restaurantName: "The Modern",
      pairingPreference: { distanceMode: "walking" },
    }),
    "8 min walk from The Modern",
  );
}

function assertQualityRankingHelpers() {
  const intent = normalizeIntent("restaurant and rooftop drinks walking distance");
  const rankedRestaurants = rankRestaurantResults(qualityRankingRestaurants.map((record) => ({ ...record })), intent).map((record) => record.name);
  const rankedActivities = rankActivityResults(rooftopRankingActivities.map((record) => ({ ...record })), intent).map((record) => record.name);

  assert(rankedRestaurants.indexOf("The Modern") < rankedRestaurants.indexOf("Dave's Hot Chicken"));
  assert(rankedRestaurants.indexOf("OLIO E PIÙ Bryant Park") < rankedRestaurants.indexOf("Dave's Hot Chicken"));
  assert.equal(rankedActivities[0], "Monarch Rooftop Lounge");
  assert(!rankedActivities.includes("Broadway Playhouse"));
  assert(rankedActivities.indexOf("Rooftop Bars NYC") > rankedActivities.indexOf("Monarch Rooftop Lounge"));
}

function main() {
  assertCanonicalIntent();
  assertPairingPreferenceAndGeo();
  assertSearchHealthClassification();
  assertLabels();
  assertQualityRankingHelpers();
  console.log("search-core QA offline fixture regression checks passed");
}

main();
