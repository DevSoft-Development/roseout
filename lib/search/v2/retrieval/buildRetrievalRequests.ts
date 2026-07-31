import { activityRetrievalTerms } from "../taxonomy";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { RetrievalRequest } from "./retrievalTypes";

const GENERAL_ACTIVITY_TERMS = ["activity", "entertainment", "things to do", "family friendly activity", "games", "museum", "art gallery", "live music", "lounge", "rooftop"];

const ACTIVITY_COMPATIBILITY_TERMS: Record<string, readonly string[]> = {
  cocktails: ["cocktails", "cocktail bar", "lounge", "bar", "nightlife"],
  drinks: ["drinks", "cocktails", "cocktail bar", "lounge", "bar", "nightlife"],
  rooftop: ["rooftop", "rooftop drinks", "rooftop bar", "rooftop lounge", "lounge"],
  sports_bar: ["sports bar", "sports viewing", "watch sports", "game viewing", "pub"],
  sports_viewing: ["sports viewing", "sports bar", "watch sports", "game viewing", "pub"],
  art_gallery: ["art gallery", "gallery", "art exhibition", "arts", "gallery opening"],
  karaoke: ["karaoke", "karaoke bar", "private karaoke", "singing rooms", "karaoke lounge"],
  escape_room: ["escape room", "escape game", "puzzle room", "immersive game", "escape experience"],
  bowling: ["bowling", "bowling alley", "bowling lanes", "family bowling"],
  live_music: ["live music", "live band", "music venue", "concert venue", "jazz club", "jazz", "performance venue", "bar with live music"],
};

const RESTAURANT_COMPATIBILITY_TERMS: Record<string, readonly string[]> = {
  halal: ["halal", "halal restaurant", "halal food", "zabiha", "middle eastern", "mediterranean", "pakistani", "indian halal"],
};

function activityTerms(category: string) {
  const normalized = category.trim().toLowerCase().replaceAll(" ", "_");
  return [...(normalized === "general" ? GENERAL_ACTIVITY_TERMS : activityRetrievalTerms(category)), ...(ACTIVITY_COMPATIBILITY_TERMS[normalized] ?? []), category.replaceAll("_", " ")];
}

export function buildRetrievalRequests(plan: SearchPlan): RetrievalRequest[] {
  const requests: RetrievalRequest[] = [];
  if (plan.restaurant.required) {
    const compatibility = [...plan.restaurant.cuisines, ...plan.restaurant.foods, ...plan.restaurant.features].flatMap((term) => RESTAURANT_COMPATIBILITY_TERMS[term.trim().toLowerCase().replaceAll(" ", "_")] ?? []);
    requests.push({ desiredRole: "restaurant", cuisines: plan.restaurant.cuisines, foods: plan.restaurant.foods, categories: [], features: plan.restaurant.features, retrievalTerms: [...new Set([...plan.restaurant.cuisines, ...plan.restaurant.foods, ...plan.restaurant.features, ...plan.restaurant.mealPeriods, ...compatibility])], eligibleStorageTypes: ["restaurant", "activity", "nightlife"], geo: plan.geo });
  }
  if (plan.activity.required) {
    const categories = plan.activity.categories.length ? plan.activity.categories : ["general"];
    for (const category of categories) {
      requests.push({ desiredRole: `${category}_activity`, cuisines: [], foods: [], categories: category === "general" ? [] : [category], features: plan.activity.features, retrievalTerms: [...new Set([...activityTerms(category), ...plan.activity.features])], eligibleStorageTypes: ["activity", "restaurant", "nightlife"], geo: plan.geo });
    }
  }
  return requests.slice(0, 3);
}
