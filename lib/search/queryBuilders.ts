import type { CanonicalSearchIntent } from "./types";

export function buildRestaurantSearchInput(intent: CanonicalSearchIntent): string {
  const tokens = new Set<string>();
  intent.mealFoodIntents.forEach((t) => tokens.add(t));
  intent.cuisines.forEach((t) => tokens.add(t));
  intent.locations.concat(intent.boroughs, intent.neighborhoods).forEach((t) => tokens.add(t));
  if (intent.mealFoodIntents.includes("steak")) tokens.add("steakhouse");
  if (intent.mealFoodIntents.length > 0) tokens.add("dinner");
  if (!intent.mealFoodIntents.length && intent.addOnFoodIntents.length) intent.addOnFoodIntents.forEach((t) => tokens.add(t));
  return [...tokens].join(" ").trim();
}

export function buildActivitySearchInput(intent: CanonicalSearchIntent): string {
  const tokens = new Set<string>();
  intent.activityIntents.forEach((t) => tokens.add(t === "paint_and_sip" ? "paint and sip sip and paint painting studio" : t));
  intent.locations.concat(intent.boroughs, intent.neighborhoods).forEach((t) => tokens.add(t));
  return [...tokens].join(" ").trim();
}
