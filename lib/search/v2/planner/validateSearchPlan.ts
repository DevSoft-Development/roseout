import { extractRawRestaurantDishTerms } from "../../enterprise/rawDishTerms";
import type { SearchIntent } from "../../enterprise/types";
import type { SearchPlan } from "./searchPlanTypes";
import { detectPlannerDomainLoss } from "./explicitDomainSignals";

const NON_DISH_ACTIVITY_RESIDUALS = new Set([
  "child",
  "children",
  "coworker",
  "coworkers",
  "date",
  "family",
  "friend",
  "friends",
  "fun",
  "group",
  "kid",
  "kids",
  "people",
  "person",
  "someone",
  "something",
  "work",
]);

function dishProbeIntent(plan: SearchPlan): SearchIntent {
  return {
    needsRestaurant: true,
    occasion: plan.occasion,
    vibe: [],
    restaurantIntent: {
      cuisineTerms: plan.restaurant.cuisines,
      foodTerms: plan.restaurant.foods,
      mealTerms: plan.restaurant.mealPeriods,
      categoryTerms: [],
      featureTerms: plan.restaurant.features,
      vibeTerms: [],
    },
    activityIntent: {
      activityTerms: plan.activity.categories,
      categoryTerms: plan.activity.categories,
      featureTerms: plan.activity.features,
      vibeTerms: [],
      alternativeGroups: [],
    },
    geo: {
      raw: null,
      neighborhood: plan.geo.neighborhood,
      borough: plan.geo.borough,
      city: plan.geo.city,
      county: plan.geo.county,
      region: null,
      state: plan.geo.state,
      requestedMarket: plan.geo.market,
      resolvedMarket: plan.geo.market,
    },
  } as unknown as SearchIntent;
}

function socialActivityResidualOnly(terms: string[]) {
  const words = terms
    .flatMap((term) => term.toLowerCase().split(/\s+/))
    .filter(Boolean);
  return words.length > 0 && words.every((word) => NON_DISH_ACTIVITY_RESIDUALS.has(word));
}

function repairArbitraryDishIntent(plan: SearchPlan) {
  const wasRestaurantRequired = plan.restaurant.required;
  const activityOnly = plan.activity.required && !wasRestaurantRequired;
  const hasMixedConnector = /\b(?:and\s+then|then|after|before|with|and)\b/i.test(plan.rawQuery);

  // Respect a clearly activity-only request. When an activity is present with a
  // connector, still probe the remaining user-authored phrase so arbitrary
  // dishes can restore the missing restaurant lane in a true mixed outing.
  if (activityOnly && !hasMixedConnector) return;

  const inferredDishTerms = extractRawRestaurantDishTerms(
    plan.rawQuery,
    dishProbeIntent(plan),
  );
  if (!inferredDishTerms.length) return;
  if (activityOnly && socialActivityResidualOnly(inferredDishTerms)) return;

  plan.restaurant.required = true;
  plan.restaurant.foods = Array.from(
    new Set([...plan.restaurant.foods, ...inferredDishTerms]),
  );

  // Only change mode/pairing when this repair actually restores a missing
  // restaurant domain. Existing broad-date and same-domain semantics stay as-is.
  if (!wasRestaurantRequired && plan.activity.required) {
    plan.mode = plan.pairing.sameVenueRequired ? "same_venue" : "paired_outing";
    plan.pairing.required = true;
  } else if (!wasRestaurantRequired) {
    plan.mode = "restaurant_only";
  }

  plan.parser.reasons = [
    ...plan.parser.reasons,
    `arbitrary dish intent restored from raw query: ${inferredDishTerms.join(",")}`,
  ];
}

export function validateSearchPlan(plan: SearchPlan): void {
  if (!plan.rawQuery.trim()) throw new Error("SEARCH_PLAN_EMPTY_QUERY");

  repairArbitraryDishIntent(plan);

  const domainContract = detectPlannerDomainLoss(plan.rawQuery, plan);
  if (domainContract.lostRestaurant) {
    throw new Error(`SEARCH_PLAN_DROPPED_RESTAURANT_INTENT:${domainContract.explicit.restaurantEvidence.join(",")}`);
  }
  if (domainContract.lostActivity) {
    throw new Error(`SEARCH_PLAN_DROPPED_ACTIVITY_INTENT:${domainContract.explicit.activityEvidence.join(",")}`);
  }

  if (plan.pairing.required && (!plan.restaurant.required || !plan.activity.required)) throw new Error("SEARCH_PLAN_INVALID_PAIRING");
  // A same-venue phrase can describe a single-domain venue requirement, e.g.
  // "seafood rooftop restaurant". Only enforce the pairing invariant when both
  // domains are required; single-domain plans do not need a pair to satisfy it.
  if (
    plan.pairing.sameVenueRequired &&
    !plan.pairing.required &&
    plan.restaurant.required &&
    plan.activity.required
  ) throw new Error("SEARCH_PLAN_INVALID_SAME_VENUE");
  if (plan.geo.radiusMiles <= 0) throw new Error("SEARCH_PLAN_INVALID_RADIUS");
  if (plan.travel.mode === "walking" && plan.travel.constraint === "none") throw new Error("SEARCH_PLAN_WALKING_REQUIRES_CONSTRAINT");
  if (plan.travel.constraint === "hard" && (plan.pairing.maxDistanceMiles == null || plan.pairing.maxDistanceMiles <= 0)) throw new Error("SEARCH_PLAN_HARD_DISTANCE_REQUIRES_LIMIT");
  if (plan.travel.mode === "walking" && plan.travel.maxWalkingMinutes != null && plan.travel.maxWalkingMinutes <= 0) throw new Error("SEARCH_PLAN_INVALID_WALKING_LIMIT");
  if (plan.travel.mode === "driving" && plan.travel.maxDrivingMinutes != null && plan.travel.maxDrivingMinutes <= 0) throw new Error("SEARCH_PLAN_INVALID_DRIVING_LIMIT");
  if (plan.pairing.requireWalkable && plan.travel.mode !== "walking") throw new Error("SEARCH_PLAN_WALKABLE_REQUIRES_WALKING_MODE");
}
