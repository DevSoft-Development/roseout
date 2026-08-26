import type { EnterpriseSearchResult } from "@/lib/search/enterprise/types";
import { activityRetrievalTerms } from "@/lib/search/v2/taxonomy";

const BROAD_ACTIVITY_CATEGORIES = new Set([
  "activity",
  "general_activity",
  "relaxed_activity",
  "things_to_do",
]);

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function planOf(result: any) {
  return result?.searchPlan ?? result?.search_plan ?? result?.debug?.searchPlan ?? result?.debug?.search_plan ?? null;
}

function textOf(row: any) {
  return normalize([
    row?.name,
    row?.restaurant_name,
    row?.activity_name,
    row?.location_type,
    row?.primary_category,
    row?.cuisine,
    row?.cuisine_type,
    row?.activity_type,
    row?.description,
    row?.approved_description,
    row?.tags,
    row?.features,
    row?.special_features,
    row?.search_keywords,
    row?.search_document,
    row?.semantic_search_text,
    row?.matched_terms,
    row?.matched_retrieval_terms,
    row?.restaurant_categories,
    row?.cuisines,
    row?.foods,
    row?.activity_categories,
    row?.nightlife_categories,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(Boolean)
    .join(" "));
}

function hasTerm(text: string, rawTerm: string) {
  const term = normalize(rawTerm);
  return Boolean(term && ((` ${text} `).includes(` ${term} `) || text.includes(term)));
}

function restaurantTerms(plan: any) {
  return [
    ...(Array.isArray(plan?.restaurant?.cuisines) ? plan.restaurant.cuisines : []),
    ...(Array.isArray(plan?.restaurant?.foods) ? plan.restaurant.foods : []),
    ...(Array.isArray(plan?.restaurant?.features) ? plan.restaurant.features : []),
  ].map(normalize).filter(Boolean);
}

function activityTerms(plan: any) {
  const categories: string[] = (Array.isArray(plan?.activity?.categories) ? plan.activity.categories : [])
    .map(String)
    .filter((category: string) => !BROAD_ACTIVITY_CATEGORIES.has(category));
  return [
    ...categories.flatMap((category: string) => activityRetrievalTerms(category)),
    ...(Array.isArray(plan?.activity?.features) ? plan.activity.features : []),
  ].map(normalize).filter(Boolean);
}

function matches(row: any, terms: string[]) {
  if (!terms.length) return true;
  const text = textOf(row);
  return terms.some((term) => hasTerm(text, term));
}

/**
 * Final production guard for semantic/behavioral post-processing. Search V2
 * already enforces explicit intent before pairing; this repeats the contract
 * after semantic rescue so an explicit request can never be replaced by a
 * merely similar category.
 */
export function applyExplicitIntentGuard(result: EnterpriseSearchResult): EnterpriseSearchResult {
  const mutable = result as any;
  const plan = planOf(mutable);
  if (!plan) return result;

  const requiredRestaurantTerms = restaurantTerms(plan);
  const requiredActivityTerms = activityTerms(plan);
  if (!requiredRestaurantTerms.length && !requiredActivityTerms.length) return result;

  const restaurants = (Array.isArray(mutable.restaurants) ? mutable.restaurants : [])
    .filter((row: any) => matches(row, requiredRestaurantTerms));
  const activities = (Array.isArray(mutable.activities) ? mutable.activities : [])
    .filter((row: any) => matches(row, requiredActivityTerms));
  const pairs = (Array.isArray(mutable.pairs) ? mutable.pairs : [])
    .filter((pair: any) =>
      matches(pair?.restaurant, requiredRestaurantTerms)
      && matches(pair?.activity, requiredActivityTerms),
    );
  const matchedLocations = (Array.isArray(mutable.matched_locations)
    ? mutable.matched_locations
    : Array.isArray(mutable.matchedLocations)
      ? mutable.matchedLocations
      : [])
    .filter((row: any) => {
      if (plan?.pairing?.sameVenueRequired) {
        return matches(row, requiredRestaurantTerms) && matches(row, requiredActivityTerms);
      }
      return matches(row, requiredRestaurantTerms) || matches(row, requiredActivityTerms);
    });

  const mixedRequired = Boolean(plan?.restaurant?.required && plan?.activity?.required && plan?.pairing?.required);
  const restaurantRequired = Boolean(plan?.restaurant?.required);
  const activityRequired = Boolean(plan?.activity?.required);
  // A separate-venue mixed outing is fulfilled only by a valid pair. A dual-role
  // matched location can fulfill the request only when the canonical plan actually
  // requires one venue.
  const fulfilled = mixedRequired
    ? pairs.length > 0 || (plan?.pairing?.sameVenueRequired === true && matchedLocations.length > 0)
    : restaurantRequired
      ? restaurants.length > 0 || matchedLocations.length > 0
      : activityRequired
        ? activities.length > 0 || matchedLocations.length > 0
        : true;

  mutable.restaurants = restaurants;
  mutable.activities = activities;
  mutable.pairs = pairs;
  mutable.matched_locations = matchedLocations;
  mutable.matchedLocations = matchedLocations;
  mutable.cards = [
    ...pairs,
    ...matchedLocations,
    ...restaurants,
    ...activities,
  ];
  mutable.restaurant_count = restaurants.length;
  mutable.activity_count = activities.length;
  mutable.pair_count = pairs.length;
  mutable.matched_location_count = matchedLocations.length;
  mutable.result_count = mutable.cards.length;
  if (mutable.card_counts) {
    mutable.card_counts = {
      ...mutable.card_counts,
      restaurants: restaurants.length,
      activities: activities.length,
      matched_locations: matchedLocations.length,
      pairs: pairs.length,
      cards: mutable.cards.length,
    };
  }
  if (mutable.cardCounts) {
    mutable.cardCounts = {
      ...mutable.cardCounts,
      restaurants: restaurants.length,
      activities: activities.length,
      matched_locations: matchedLocations.length,
      pairs: pairs.length,
      cards: mutable.cards.length,
    };
  }
  mutable.requestFulfilled = fulfilled;
  if (!fulfilled) {
    mutable.success = false;
    mutable.partialResults = restaurants.length > 0 || activities.length > 0 || matchedLocations.length > 0;
    mutable.outcome = mixedRequired ? "no_compatible_pair" : "no_explicit_intent_match";
  }
  mutable.debug = {
    ...(mutable.debug ?? {}),
    explicitIntentGuard: {
      applied: true,
      restaurantTerms: requiredRestaurantTerms,
      activityTerms: requiredActivityTerms,
      restaurantCount: restaurants.length,
      activityCount: activities.length,
      pairCount: pairs.length,
      matchedLocationCount: matchedLocations.length,
      requestFulfilled: fulfilled,
    },
  };
  return mutable as EnterpriseSearchResult;
}
