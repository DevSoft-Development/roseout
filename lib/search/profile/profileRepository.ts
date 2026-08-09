import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildLocationSearchProfile } from "./buildLocationSearchProfile";
import type { LocationProfileSource, ManualProfileOverrides } from "./profileTypes";

export const LOCATION_PROFILE_PRODUCTION_COLUMNS = [
  "id",
  "name",
  "restaurant_name",
  "activity_name",
  "location_type",
  "activity_type",
  "primary_category",
  "category",
  "type",
  "google_primary_type",
  "google_types",
  "google_meal_periods",
  "primary_tag",
  "tags",
  "semantic_tags",
  "intent_tags",
  "cuisine",
  "cuisine_type",
  "food_type",
  "signature_items",
  "special_features",
  "vibe_tags",
  "best_for",
  "best_for_tags",
  "date_style_tags",
  "search_keywords",
  "review_keywords",
  "description",
  "address",
  "market",
  "city",
  "neighborhood",
  "borough",
  "county",
  "state",
  "latitude",
  "longitude",
  "active",
  "is_searchable",
  "is_hidden",
  "is_low_level",
  "outdoor_seating",
  "private_room_available",
  "live_music",
  "rooftop",
  "waterfront",
  "kid_friendly",
  "pet_friendly",
  "group_friendly",
] as const;

// These columns are present in every supported production schema. The worker
// retries with this projection when an older environment is missing one of the
// optional enrichment columns above, instead of failing the entire backfill.
export const LOCATION_PROFILE_CORE_COLUMNS = [
  "id",
  "name",
  "restaurant_name",
  "activity_name",
  "location_type",
  "activity_type",
  "primary_category",
  "description",
  "address",
  "market",
  "city",
  "neighborhood",
  "borough",
  "county",
  "state",
  "latitude",
  "longitude",
  "active",
  "is_searchable",
  "is_hidden",
  "is_low_level",
  "live_music",
  "rooftop",
  "waterfront",
] as const;

const locationProjection = LOCATION_PROFILE_PRODUCTION_COLUMNS.join(",");
const coreLocationProjection = LOCATION_PROFILE_CORE_COLUMNS.join(",");

type ProductionLocationRow = Record<string, unknown>;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function enabledFeature(row: ProductionLocationRow, field: string, label: string): string | null {
  return row[field] === true ? label : null;
}

function isMissingColumnError(message: string): boolean {
  return /column\s+(?:public\.)?locations\.[a-z0-9_]+\s+does not exist/i.test(message)
    || /column\s+locations\.[a-z0-9_]+\s+does not exist/i.test(message);
}

async function readLocationForProfile(locationId: string): Promise<ProductionLocationRow | null> {
  const fullRead = await supabaseAdmin
    .from("locations")
    .select(locationProjection)
    .eq("id", locationId)
    .maybeSingle();

  if (!fullRead.error) return fullRead.data as unknown as ProductionLocationRow | null;
  if (!isMissingColumnError(fullRead.error.message)) {
    throw new Error(`Location read failed: ${fullRead.error.message}`);
  }

  const coreRead = await supabaseAdmin
    .from("locations")
    .select(coreLocationProjection)
    .eq("id", locationId)
    .maybeSingle();

  if (coreRead.error) throw new Error(`Location read failed: ${coreRead.error.message}`);
  return coreRead.data as unknown as ProductionLocationRow | null;
}

export function normalizeCanonicalLocationClassification(row: ProductionLocationRow) {
  const categories = unique([
    text(row.primary_category),
    text(row.category),
    text(row.location_type),
    text(row.activity_type),
    text(row.type),
    text(row.google_primary_type),
    text(row.primary_tag),
    ...textArray(row.google_types),
    ...textArray(row.google_meal_periods),
    ...textArray(row.tags),
    ...textArray(row.semantic_tags),
    ...textArray(row.intent_tags),
  ]);

  const cuisines = unique([
    text(row.cuisine),
    text(row.cuisine_type),
  ]);

  const foodTerms = unique([
    text(row.food_type),
    ...textArray(row.signature_items),
  ]);

  const features = unique([
    ...textArray(row.special_features),
    ...textArray(row.vibe_tags),
    ...textArray(row.best_for),
    ...textArray(row.best_for_tags),
    ...textArray(row.date_style_tags),
    ...textArray(row.search_keywords),
    ...textArray(row.review_keywords),
    enabledFeature(row, "outdoor_seating", "outdoor seating"),
    enabledFeature(row, "private_room_available", "private room"),
    enabledFeature(row, "live_music", "live music"),
    enabledFeature(row, "rooftop", "rooftop"),
    enabledFeature(row, "waterfront", "waterfront"),
    enabledFeature(row, "kid_friendly", "kid friendly"),
    enabledFeature(row, "pet_friendly", "pet friendly"),
    enabledFeature(row, "group_friendly", "group friendly"),
  ]);

  return { categories, cuisines, foodTerms, features };
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function refreshLocationSearchProfile(
  locationId: string,
  reason: string,
  overrides?: ManualProfileOverrides,
) {
  const row = await readLocationForProfile(locationId);
  if (!row) throw new Error("Location not found");

  const classification = normalizeCanonicalLocationClassification(row);
  const source: LocationProfileSource = {
    id: String(row.id),
    name: text(row.name) ?? text(row.restaurant_name) ?? text(row.activity_name) ?? "Unknown location",
    restaurantName: text(row.restaurant_name),
    activityName: text(row.activity_name),
    locationType: text(row.location_type),
    activityType: text(row.activity_type),
    primaryCategory: text(row.primary_category) ?? text(row.category),
    categories: classification.categories,
    cuisines: classification.cuisines,
    foodTerms: classification.foodTerms,
    features: classification.features,
    description: text(row.description),
    address: text(row.address),
    market: text(row.market),
    city: text(row.city),
    neighborhood: text(row.neighborhood),
    borough: text(row.borough),
    county: text(row.county),
    state: text(row.state),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    active: typeof row.active === "boolean" ? row.active : null,
    searchable: typeof row.is_searchable === "boolean" ? row.is_searchable : null,
    hidden: typeof row.is_hidden === "boolean" ? row.is_hidden : null,
    isLowLevel: typeof row.is_low_level === "boolean" ? row.is_low_level : null,
  };

  const profile = buildLocationSearchProfile(source, overrides);
  const profileRow = {
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

  const result = await supabaseAdmin
    .from("location_search_profiles")
    .upsert(profileRow, { onConflict: "location_id" })
    .select("*")
    .single();

  if (result.error) throw new Error(`Profile write failed (${reason}): ${result.error.message}`);
  return result.data;
}

export async function enqueueLocationSearchProfileRefresh(locationId: string, reason: string) {
  const now = new Date().toISOString();
  const existing = await supabaseAdmin
    .from("location_search_profile_refresh_queue")
    .select("id")
    .eq("location_id", locationId)
    .in("status", ["pending", "processing"])
    .limit(1);

  if (existing.error) throw new Error(`Profile queue lookup failed: ${existing.error.message}`);
  if ((existing.data ?? []).length) {
    const update = await supabaseAdmin
      .from("location_search_profile_refresh_queue")
      .update({ reason, available_at: now, updated_at: now })
      .eq("id", existing.data![0].id);
    if (update.error) throw new Error(`Profile enqueue failed: ${update.error.message}`);
    return;
  }

  const insert = await supabaseAdmin
    .from("location_search_profile_refresh_queue")
    .insert({
      location_id: locationId,
      reason,
      status: "pending",
      available_at: now,
      updated_at: now,
    });

  if (insert.error) throw new Error(`Profile enqueue failed: ${insert.error.message}`);
}
