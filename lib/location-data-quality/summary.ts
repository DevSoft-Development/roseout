import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const SOURCE_TABLES = ["locations", "restaurants", "activities"] as const;
type SourceTable = (typeof SOURCE_TABLES)[number];

export type LocationDataQualitySummary = {
  generatedAt: string;
  staleDays: number;
  totals: Record<SourceTable, number>;
  totalRecords: number;
  missingGooglePlaceId: number;
  staleGoogleEnrichment: number;
  weakSearchMetadata: number;
  genericRestaurantCuisine: number;
  pendingGoogleReview: number;
  searchProfilesNeedingReview: number;
};

async function count(table: string, configure?: (query: any) => any) {
  let query = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (configure) query = configure(query);
  const { count: value, error } = await query;
  if (error) throw new Error(`${table} quality count failed: ${error.message}`);
  return value || 0;
}

async function countStale(table: SourceTable, cutoff: string) {
  const [neverEnriched, oldEnrichment] = await Promise.all([
    count(table, (query) => query.is("google_enriched_at", null)),
    count(table, (query) => query.lt("google_enriched_at", cutoff)),
  ]);
  return neverEnriched + oldEnrichment;
}

export async function getLocationDataQualitySummary(staleDays = 90): Promise<LocationDataQualitySummary> {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();

  const [locationsTotal, restaurantsTotal, activitiesTotal] = await Promise.all(
    SOURCE_TABLES.map((table) => count(table)),
  );

  const [missingGooglePlaceId, staleGoogleEnrichment, weakSearchMetadata] = await Promise.all([
    Promise.all(SOURCE_TABLES.map((table) => count(table, (query) => query.is("google_place_id", null)))).then((values) => values.reduce((sum, value) => sum + value, 0)),
    Promise.all(SOURCE_TABLES.map((table) => countStale(table, cutoff))).then((values) => values.reduce((sum, value) => sum + value, 0)),
    Promise.all(
      SOURCE_TABLES.map((table) =>
        count(table, (query) => query.or("search_keywords.is.null,semantic_tags.is.null,intent_tags.is.null")),
      ),
    ).then((values) => values.reduce((sum, value) => sum + value, 0)),
  ]);

  const [genericRestaurantCuisine, pendingGoogleReview, searchProfilesNeedingReview] = await Promise.all([
    count("restaurants", (query) =>
      query.or("cuisine.is.null,cuisine.eq.restaurant,cuisine.eq.restaurants,cuisine.eq.food,cuisine.eq.dining,cuisine_type.is.null"),
    ),
    count("location_google_food_term_suggestions", (query) => query.in("status", ["pending_review", "auto_apply_ready"])),
    count("location_search_profiles", (query) => query.eq("needs_review", true)),
  ]);

  const totals = {
    locations: locationsTotal,
    restaurants: restaurantsTotal,
    activities: activitiesTotal,
  };

  return {
    generatedAt: new Date().toISOString(),
    staleDays,
    totals,
    totalRecords: locationsTotal + restaurantsTotal + activitiesTotal,
    missingGooglePlaceId,
    staleGoogleEnrichment,
    weakSearchMetadata,
    genericRestaurantCuisine,
    pendingGoogleReview,
    searchProfilesNeedingReview,
  };
}
