import type { CanonicalSearchIntent } from "./types";

export function buildOutingPairs(restaurants: any[], activities: any[], intent: CanonicalSearchIntent) {
  if (!(intent.wantsFood && intent.wantsActivity)) return [];
  if (!restaurants.length || !activities.length) return [];
  const pairs = [];
  const max = Math.min(restaurants.length, activities.length, 10);
  for (let i = 0; i < max; i += 1) {
    pairs.push({ restaurant: restaurants[i], activity: activities[i] });
  }
  return pairs;
}
