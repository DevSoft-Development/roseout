import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";

export type SeoLocation = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  city?: string | null;
  state?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  primary_category?: string | null;
  main_image?: string | null;
  image_url?: string | null;
  rating?: number | null;
};

export function titleCaseSlug(value: string) {
  return decodeURIComponent(value || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function loadSeoLocations({ city, cuisine, category, limit = 24 }: { city: string; cuisine?: string; category?: string; limit?: number }) {
  let query = supabaseAdmin
    .from("locations")
    .select("id, name, restaurant_name, activity_name, city, state, cuisine, cuisine_type, primary_category, main_image, image_url, rating, is_searchable, data_status, is_hidden, status")
    .eq("is_searchable", true)
    .eq("data_status", "clean")
    .not("is_hidden", "is", true)
    .not("status", "in", '("closed","archived")')
    .ilike("city", titleCaseSlug(city))
    .order("theouthaven_score", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (cuisine) {
    const label = titleCaseSlug(cuisine);
    query = query.or(`cuisine.ilike.%${label}%,cuisine_type.ilike.%${label}%,search_document.ilike.%${label}%`);
  }

  if (category) {
    const label = titleCaseSlug(category);
    query = query.or(`primary_category.ilike.%${label}%,search_document.ilike.%${label}%`);
  }

  const { data } = await query;
  return (data || []) as SeoLocation[];
}

export function locationHref(location: SeoLocation) {
  const type = String(location.primary_category || "").toLowerCase().includes("activity") ? "activities" : "restaurants";
  return `/locations/${type}/${location.id}`;
}

export function locationCardName(location: SeoLocation) {
  return getLocationName(location, "TheOutHaven location");
}
