import { isExactRequestedNeighborhoodMatch, isSameRequestedBoroughMatch } from "./geo-matching";
import type { CanonicalSearchIntent } from "./types";
import { areMarketsPairable, inferMarketFromCityStateCounty, type MarketKey } from "../location-markets";
import { calculatePairReviewFit } from "../ml/reviewIntelligence";

function textField(record: any, field: string) {
  return String(record?.[field] ?? "").toLowerCase().trim();
}

function sameField(a: any, b: any, field: string) {
  const av = textField(a, field);
  const bv = textField(b, field);
  return Boolean(av && bv && av === bv);
}

function recordMarket(record: any): MarketKey {
  return inferMarketFromCityStateCounty(record) as MarketKey;
}

function pairScore(restaurant: any, activity: any, intent: CanonicalSearchIntent) {
  let score = 0;
  if (areMarketsPairable(recordMarket(restaurant), recordMarket(activity))) score += 500;
  if (sameField(restaurant, activity, "neighborhood")) score += 300;
  if (sameField(restaurant, activity, "borough")) score += 150;
  if (intent.geoIntent) {
    if (isExactRequestedNeighborhoodMatch(restaurant, intent.geoIntent)) score += 80;
    if (isExactRequestedNeighborhoodMatch(activity, intent.geoIntent)) score += 80;
    if (isSameRequestedBoroughMatch(restaurant, intent.geoIntent)) score += 40;
    if (isSameRequestedBoroughMatch(activity, intent.geoIntent)) score += 40;
  }
  score += calculatePairReviewFit(restaurant.review_ml_features || restaurant.location_review_ml_features, activity.review_ml_features || activity.location_review_ml_features, intent);
  return score;
}

function localResultsExist(restaurants: any[], activities: any[], intent: CanonicalSearchIntent) {
  if (!intent.geoIntent?.borough && !intent.geoIntent?.neighborhood) return false;
  return restaurants.some((restaurant) => isSameRequestedBoroughMatch(restaurant, intent.geoIntent)) &&
    activities.some((activity) => isSameRequestedBoroughMatch(activity, intent.geoIntent));
}

export function buildOutingPairs(restaurants: any[], activities: any[], intent: CanonicalSearchIntent) {
  if (!intent.wantsPairing && !(intent.needsRestaurant && intent.needsActivity)) return [];
  if (!restaurants.length || !activities.length) return [];

  const mustStayLocal = localResultsExist(restaurants, activities, intent);
  const combos = restaurants.flatMap((restaurant) => activities.map((activity) => ({ restaurant, activity })));
  const marketCompatible = combos.filter(({ restaurant, activity }) => areMarketsPairable(recordMarket(restaurant), recordMarket(activity)));
  const eligible = mustStayLocal
    ? marketCompatible.filter(({ restaurant, activity }) =>
        isSameRequestedBoroughMatch(restaurant, intent.geoIntent) && isSameRequestedBoroughMatch(activity, intent.geoIntent)
      )
    : marketCompatible;

  return eligible
    .sort((a, b) => pairScore(b.restaurant, b.activity, intent) - pairScore(a.restaurant, a.activity, intent))
    .slice(0, 10);
}
