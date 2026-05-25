import { supabaseAdmin } from "../supabase-admin";
import type { CanonicalSearchIntent } from "./types";

async function searchLocations(search: string) {
  if (!search) return [];
  const { data } = await supabaseAdmin.from("locations").select("*").textSearch("search_vector", search, { type: "websearch" }).limit(20);
  return data || [];
}

export async function searchRestaurants(intent: CanonicalSearchIntent) {
  const rows = await searchLocations(intent.restaurantSearchInput);
  return rows.filter((r: any) => !(r?.category || "").toLowerCase().includes("activity"));
}

export async function searchActivities(intent: CanonicalSearchIntent) {
  const rows = await searchLocations(intent.activitySearchInput);
  return rows.filter((r: any) => /(activity|bar|lounge|nightlife|entertainment)/i.test(`${r?.category || ""} ${r?.subcategory || ""} ${r?.description || ""}`));
}

export async function searchFallbackRestaurants(intent: CanonicalSearchIntent) {
  const mealQuery = [...intent.mealFoodIntents, ...intent.locations].join(" ");
  return searchLocations(mealQuery || intent.restaurantSearchInput);
}

export async function searchFallbackActivities(intent: CanonicalSearchIntent) {
  return searchLocations([...intent.activityIntents, ...intent.locations].join(" ") || intent.activitySearchInput);
}
