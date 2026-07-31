import { runtimeRetrievalTerms } from "../taxonomy/runtimeTaxonomy";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { RetrievalRequest } from "./retrievalTypes";

const GENERAL_ACTIVITY_TERMS = ["activity", "entertainment", "things to do", "family friendly activity", "games", "museum", "art gallery", "live music", "lounge", "rooftop"];

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function taxonomyTerms(term: string) {
  return runtimeRetrievalTerms(normalized(term));
}

function activityTerms(category: string) {
  const key = normalized(category);
  return [...new Set([...(key === "general" ? GENERAL_ACTIVITY_TERMS : taxonomyTerms(key)), category.replaceAll("_", " ")])];
}

export function buildRetrievalRequests(plan: SearchPlan): RetrievalRequest[] {
  const requests: RetrievalRequest[] = [];
  if (plan.restaurant.required) {
    const requested = [...plan.restaurant.cuisines, ...plan.restaurant.foods, ...plan.restaurant.features, ...plan.restaurant.mealPeriods];
    const retrievalTerms = [...new Set(requested.flatMap((term) => taxonomyTerms(term)))];
    requests.push({
      desiredRole: "restaurant",
      cuisines: plan.restaurant.cuisines,
      foods: plan.restaurant.foods,
      categories: [],
      features: plan.restaurant.features,
      retrievalTerms,
      eligibleStorageTypes: ["restaurant", "activity", "nightlife"],
      geo: plan.geo,
    });
  }
  if (plan.activity.required) {
    const categories = plan.activity.categories.length ? plan.activity.categories : ["general"];
    for (const category of categories) {
      const retrievalTerms = [...new Set([...activityTerms(category), ...plan.activity.features.flatMap((term) => taxonomyTerms(term))])];
      requests.push({
        desiredRole: `${category}_activity`,
        cuisines: [],
        foods: [],
        categories: category === "general" ? [] : [category],
        features: plan.activity.features,
        retrievalTerms,
        eligibleStorageTypes: ["activity", "restaurant", "nightlife"],
        geo: plan.geo,
      });
    }
  }
  return requests.slice(0, 3);
}
