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
    .select("id, name, restaurant_name, activity_name, city, state, cuisine, cuisine_type, primary_category, main_image, image_url, rating, is_searchable, data_status, is_hidden, status, quality_status, duplicate_status, has_photos, photo_status, is_low_level, public_visibility_tier, curation_tier, source_quality_status, import_confidence")
    .eq("is_searchable", true)
    .eq("data_status", "clean")
    .eq("quality_status", "publish_ready")
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .eq("has_photos", true)
    .not("photo_status", "eq", "missing_photo")
    .not("is_hidden", "is", true)
    .not("status", "in", '("closed","archived")')
    .or("is_low_level.is.null,is_low_level.eq.false")
    .not("public_visibility_tier", "in", '("low_level","hidden")')
    .not("curation_tier", "eq", "low_level")
    .not("source_quality_status", "in", '("imported_unverified","generic_restaurant","needs_enrichment","low_level_review")')
    .not("import_confidence", "eq", "low")
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
