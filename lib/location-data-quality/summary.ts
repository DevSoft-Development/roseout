import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const SOURCE_TABLES = ["locations", "restaurants", "activities"] as const;
type SourceTable = (typeof SOURCE_TABLES)[number];

const WEAK_METADATA_FILTERS: Record<SourceTable, string> = {
  locations: "search_keywords.is.null,semantic_tags.is.null,intent_tags.is.null",
  restaurants: "search_keywords.is.null",
  activities: "search_keywords.is.null",
};

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: any) {
  return [error?.message, error?.details, error?.hint, error?.code]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" | ") || "unknown Supabase error";
}

async function count(table: string, configure?: (query: any) => any) {
  let lastError: any = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let query = supabaseAdmin.from(table).select("*", { count: "exact", head: true });
    if (configure) query = configure(query);
    const { count: value, error } = await query;

    if (!error) return value || 0;
    lastError = error;

    if (attempt < 3) {
      await sleep(attempt * 100);
    }
  }

  throw new Error(`${table} quality count failed after 3 attempts: ${errorMessage(lastError)}`);
}

async function countStale(table: SourceTable, cutoff: string) {
  const neverEnriched = await count(table, (query) => query.is("google_enriched_at", null));
  const oldEnrichment = await count(table, (query) => query.lt("google_enriched_at", cutoff));
  return neverEnriched + oldEnrichment;
}

export async function getLocationDataQualitySummary(staleDays = 90): Promise<LocationDataQualitySummary> {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();

  const totals = {
    locations: 0,
    restaurants: 0,
    activities: 0,
  } satisfies Record<SourceTable, number>;

  let missingGooglePlaceId = 0;
  let staleGoogleEnrichment = 0;
  let weakSearchMetadata = 0;

  // Keep the Data API workload deliberately bounded and only query columns
  // that actually exist on each source table. Restaurants and activities do
  // not have the canonical semantic_tags / intent_tags columns that locations has.
  for (const table of SOURCE_TABLES) {
    totals[table] = await count(table);
    missingGooglePlaceId += await count(table, (query) => query.is("google_place_id", null));
    staleGoogleEnrichment += await countStale(table, cutoff);
    weakSearchMetadata += await count(
      table,
      (query) => query.or(WEAK_METADATA_FILTERS[table]),
    );
  }

  const genericRestaurantCuisine = await count("restaurants", (query) =>
    query.or("cuisine.is.null,cuisine.eq.restaurant,cuisine.eq.restaurants,cuisine.eq.food,cuisine.eq.dining,cuisine_type.is.null"),
  );
  const pendingGoogleReview = await count(
    "location_google_food_term_suggestions",
    (query) => query.in("status", ["pending_review", "auto_apply_ready"]),
  );
  const searchProfilesNeedingReview = await count(
    "location_search_profiles",
    (query) => query.eq("needs_review", true),
  );

  return {
    generatedAt: new Date().toISOString(),
    staleDays,
    totals,
    totalRecords: totals.locations + totals.restaurants + totals.activities,
    missingGooglePlaceId,
    staleGoogleEnrichment,
    weakSearchMetadata,
    genericRestaurantCuisine,
    pendingGoogleReview,
    searchProfilesNeedingReview,
  };
}
