import type { CanonicalSearchIntent } from "./types";

export function buildOutingPairs(restaurants: any[], activities: any[], intent: CanonicalSearchIntent) {
  if (!intent.wantsFood || !intent.wantsActivity || !restaurants.length || !activities.length) return [];
  return restaurants.slice(0, 5).map((restaurant, i) => ({
    restaurant,
    activity: activities[i % activities.length],
    same_borough: restaurant?.borough && activities[i % activities.length]?.borough && restaurant.borough === activities[i % activities.length].borough,
  }));
}
