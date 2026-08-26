import type { SearchTrace } from "../observability/searchTrace";
import type { SearchPlan } from "../planner/searchPlanTypes";
import { activityRetrievalTerms } from "../taxonomy";
import type { ScoredCandidate } from "./scoringTypes";

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

function locationText(item: ScoredCandidate) {
  const location = item.candidate.candidate.location as Record<string, any>;
  return normalize([
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.primary_category,
    location.cuisine,
    location.cuisine_type,
    location.activity_type,
    location.description,
    location.approved_description,
    location.tags,
    location.features,
    location.special_features,
    location.search_keywords,
    location.search_document,
    location.semantic_search_text,
    location.restaurant_categories,
    location.cuisines,
    location.foods,
    location.activity_categories,
    location.nightlife_categories,
    ...item.candidate.candidate.matchedRetrievalTerms,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(Boolean)
    .join(" "));
}

function hasTerm(text: string, rawTerm: string) {
  const term = normalize(rawTerm);
  if (!term) return false;
  return (` ${text} `).includes(` ${term} `) || text.includes(term);
}

function explicitTerms(plan: SearchPlan, item: ScoredCandidate) {
  const restaurant = item.selectedRole === "restaurant" || item.selectedRole.endsWith("_restaurant");
  if (restaurant) {
    return [...plan.restaurant.cuisines, ...plan.restaurant.foods, ...plan.restaurant.features]
      .map(normalize)
      .filter(Boolean);
  }

  const categories = plan.activity.categories.filter((category) => !BROAD_ACTIVITY_CATEGORIES.has(String(category)));
  return [
    ...categories.flatMap((category) => activityRetrievalTerms(category)),
    ...plan.activity.features,
  ]
    .map(normalize)
    .filter(Boolean);
}

function matchesExplicitIntent(plan: SearchPlan, item: ScoredCandidate) {
  const terms = explicitTerms(plan, item);
  if (!terms.length) return true;
  const text = locationText(item);
  return terms.some((term) => hasTerm(text, term));
}

/**
 * Explicit cuisine, food, venue-feature and activity requests are hard search
 * constraints. If inventory has no matching candidate, return partial/no result
 * rather than silently substituting an unrelated category.
 */
export function enforceExplicitIntent({
  plan,
  scored,
  trace,
}: {
  plan: SearchPlan;
  scored: { all: ScoredCandidate[]; restaurants: ScoredCandidate[]; activities: ScoredCandidate[] };
  trace?: SearchTrace;
}) {
  const keep = new Set(scored.all.filter((item) => matchesExplicitIntent(plan, item)));
  const restaurants = scored.restaurants.filter((item) => keep.has(item));
  const activities = scored.activities.filter((item) => keep.has(item));
  const allowed = new Set([...restaurants, ...activities]);
  const all = scored.all.filter((item) => allowed.has(item));

  trace?.decisions.push({
    stage: "explicit_intent_contract",
    decision: "explicit_terms_enforced",
    reason: JSON.stringify({
      restaurantBefore: scored.restaurants.length,
      restaurantAfter: restaurants.length,
      activityBefore: scored.activities.length,
      activityAfter: activities.length,
      removed: scored.all.length - all.length,
      restaurantTerms: [...plan.restaurant.cuisines, ...plan.restaurant.foods, ...plan.restaurant.features],
      activityCategories: plan.activity.categories,
      activityFeatures: plan.activity.features,
    }),
  });

  return { all, restaurants, activities };
}
