import type { CanonicalSearchIntent } from "@/lib/search/types";

const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))];

export function buildRestaurantSearchInput(intent: CanonicalSearchIntent): string {
  const terms = uniq([
    ...intent.mealFoodIntents,
    ...intent.cuisines,
    ...(intent.mealFoodIntents.includes("steak") ? ["steakhouse", "dinner"] : []),
    ...intent.boroughs,
    ...intent.neighborhoods,
    ...intent.vibes,
  ]);
  return terms.join(" ").trim();
}

export function buildActivitySearchInput(intent: CanonicalSearchIntent): string {
  const terms = uniq([
    ...intent.activityIntents.map((v) => (v === "paint_and_sip" ? "paint and sip sip and paint painting studio" : v)),
    ...intent.boroughs,
    ...intent.neighborhoods,
    ...intent.vibes,
  ]);
  return terms.join(" ").trim();
}
