import { supabase } from "@/lib/supabase";
import type { CanonicalSearchIntent } from "@/lib/search/types";

async function searchTable(table: string, text: string, limit = 24) {
  const { data } = await supabase
    .from(table)
    .select("*")
    .or(`name.ilike.%${text}%,description.ilike.%${text}%,cuisine.ilike.%${text}%,category.ilike.%${text}%`)
    .limit(limit);
  return data ?? [];
}

export const searchRestaurants = (intent: CanonicalSearchIntent) =>
  searchTable("locations", intent.restaurantSearchInput || intent.mealFoodIntents.join(" "));

export const searchActivities = (intent: CanonicalSearchIntent) =>
  searchTable("locations", intent.activitySearchInput || intent.activityIntents.join(" "));

export const searchFallbackRestaurants = (intent: CanonicalSearchIntent) =>
  searchTable("locations", [...intent.mealFoodIntents, ...intent.boroughs].join(" "));

export const searchFallbackActivities = (intent: CanonicalSearchIntent) =>
  searchTable("locations", [...intent.activityIntents, ...intent.boroughs].join(" "));
