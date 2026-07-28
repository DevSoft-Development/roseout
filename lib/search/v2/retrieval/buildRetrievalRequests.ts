import { activityRetrievalTerms } from "../taxonomy";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { RetrievalRequest } from "./retrievalTypes";

const GENERAL_ACTIVITY_TERMS = [
  "activity",
  "entertainment",
  "things to do",
  "family friendly activity",
  "games",
  "museum",
  "gallery",
  "live music",
  "lounge",
  "rooftop",
];

export function buildRetrievalRequests(plan: SearchPlan): RetrievalRequest[] {
  const requests: RetrievalRequest[] = [];

  if (plan.restaurant.required) {
    requests.push({
      desiredRole: "restaurant",
      cuisines: plan.restaurant.cuisines,
      foods: plan.restaurant.foods,
      categories: [],
      features: plan.restaurant.features,
      retrievalTerms: [
        ...plan.restaurant.cuisines,
        ...plan.restaurant.foods,
        ...plan.restaurant.mealPeriods,
        "restaurant",
      ],
      eligibleStorageTypes: ["restaurant", "activity", "nightlife"],
      geo: plan.geo,
    });
  }

  if (plan.activity.required) {
    const categories = plan.activity.categories.length
      ? plan.activity.categories
      : ["general"];

    for (const category of categories) {
      const categoryTerms =
        category === "general"
          ? GENERAL_ACTIVITY_TERMS
          : activityRetrievalTerms(category);

      requests.push({
        desiredRole: `${category}_activity`,
        cuisines: [],
        foods: [],
        categories: category === "general" ? [] : [category],
        features: plan.activity.features,
        retrievalTerms: [
          ...new Set([
            ...categoryTerms,
            category.replaceAll("_", " "),
            "activity",
          ]),
        ],
        eligibleStorageTypes: ["activity", "restaurant", "nightlife"],
        geo: plan.geo,
      });
    }
  }

  return requests.slice(0, 3);
}
