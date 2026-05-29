import type { CanonicalSearchIntent } from "./types";

const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))];

export function buildRestaurantSearchInput(intent: CanonicalSearchIntent): string {
  if (
    (intent.boroughs.length > 0 || Boolean(intent.geoIntent)) &&
    intent.mealFoodIntents.length === 0 &&
    intent.activityIntents.length === 0
  ) {
    return uniq([...intent.boroughs, ...intent.neighborhoods, ...(intent.geoIntent?.terms ?? []), "restaurant"]).join(" ");
  }
  const specificTerms = intent.specificMealFoodIntents ?? [];
  const mealTerms = specificTerms.length > 0 ? specificTerms : intent.mealFoodIntents;
  const terms = uniq([
    ...mealTerms,
    ...intent.cuisines,
    ...(mealTerms.includes("steak") ? ["steakhouse"] : []),
    ...intent.boroughs,
    ...intent.neighborhoods,
    ...(intent.geoIntent?.terms ?? []),
    ...intent.vibes,
  ]);
  return terms.join(" ").trim();
}

export function buildActivitySearchInput(intent: CanonicalSearchIntent): string {
  if (
    (intent.boroughs.length > 0 || Boolean(intent.geoIntent)) &&
    intent.mealFoodIntents.length === 0 &&
    intent.activityIntents.length === 0
  ) {
    return uniq([...intent.boroughs, ...intent.neighborhoods, ...(intent.geoIntent?.terms ?? []), "activity", "nightlife", "experience"]).join(" ");
  }
  const activityVibes = intent.vibes.filter((vibe) => vibe !== "rooftop" || intent.activityIntents.includes("rooftop"));
  const terms = uniq([
    ...intent.activityIntents.map((v) => (v === "paint_and_sip" ? "paint and sip sip and paint painting studio" : v)),
    ...intent.boroughs,
    ...intent.neighborhoods,
    ...(intent.geoIntent?.terms ?? []),
    ...activityVibes,
  ]);
  return terms.join(" ").trim();
}
