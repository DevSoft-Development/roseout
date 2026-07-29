import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildLocationSearchProfile } from "./buildLocationSearchProfile";
import type { LocationProfileSource, ManualProfileOverrides } from "./profileTypes";

const locationProjection = "id,name,restaurant_name,activity_name,location_type,activity_type,primary_category,categories,cuisines,food_terms,features,description,address,market,city,neighborhood,borough,county,state,latitude,longitude,active,searchable,hidden,is_low_level";

export async function refreshLocationSearchProfile(locationId: string, reason: string, overrides?: ManualProfileOverrides) {
  const { data, error } = await supabaseAdmin.from("locations").select(locationProjection).eq("id", locationId).maybeSingle();
  if (error) throw new Error(`Location read failed: ${error.message}`);
  if (!data) throw new Error("Location not found");
  const source: LocationProfileSource = {
    id: data.id,
    name: data.name,
    restaurantName: data.restaurant_name,
    activityName: data.activity_name,
    locationType: data.location_type,
    activityType: data.activity_type,
    primaryCategory: data.primary_category,
    categories: data.categories,
    cuisines: data.cuisines,
    foodTerms: data.food_terms,
    features: data.features,
    description: data.description,
    address: data.address,
    market: data.market,
    city: data.city,
    neighborhood: data.neighborhood,
    borough: data.borough,
    county: data.county,
    state: data.state,
    latitude: data.latitude,
    longitude: data.longitude,
    active: data.active,
    searchable: data.searchable,
    hidden: data.hidden,
    isLowLevel: data.is_low_level,
  };
  const profile = buildLocationSearchProfile(source, overrides);
  const row = {
    location_id: profile.locationId,
    primary_domain: profile.primaryDomain,
    supported_domains: profile.supportedDomains,
    restaurant_categories: profile.restaurantCategories,
    cuisines: profile.cuisines,
    foods: profile.foods,
    activity_categories: profile.activityCategories,
    nightlife_categories: profile.nightlifeCategories,
    meal_periods: profile.mealPeriods,
    features: profile.features,
    audiences: profile.audiences,
    occasions: profile.occasions,
    vibes: profile.vibes,
    canonical_terms: profile.canonicalTerms,
    exclusions: profile.exclusions,
    search_text: profile.searchText,
    latitude: profile.latitude,
    longitude: profile.longitude,
    market: profile.market,
    city: profile.city,
    neighborhood: profile.neighborhood,
    borough: profile.borough,
    county: profile.county,
    state: profile.state,
    classification_sources: profile.classificationSources,
    evidence: profile.evidence,
    manual_overrides: profile.manualOverrides,
    confidence: profile.confidence,
    needs_review: profile.needsReview,
    review_reasons: profile.reviewReasons,
    profile_version: profile.profileVersion,
    profile_hash: profile.profileHash,
    generated_at: profile.generatedAt,
    updated_at: profile.generatedAt,
  };
  const result = await supabaseAdmin.from("location_search_profiles").upsert(row, { onConflict: "location_id" }).select("*").single();
  if (result.error) throw new Error(`Profile write failed (${reason}): ${result.error.message}`);
  return result.data;
}

export async function enqueueLocationSearchProfileRefresh(locationId: string, reason: string) {
  const { error } = await supabaseAdmin.from("location_search_profile_refresh_queue").upsert({ location_id: locationId, reason, status: "queued", available_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "location_id,status" });
  if (error) throw new Error(`Profile enqueue failed: ${error.message}`);
}
