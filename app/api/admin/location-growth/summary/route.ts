import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getSiteUrl } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Supabase filter builders are intentionally dynamic across generated table types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

async function authorize(request: Request) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") ===
      process.env.IMPORT_SECRET
  ) {
    return null;
  }
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  return error;
}


type LocationPhotoStats = {
  hasPhotos: number;
  searchableWithPhotos: number;
  searchableMissingPhotos: number;
  nonSearchableMissingPhotos: number;
  photoBacklogNoGooglePlaceId: number;
  photoBacklogLowQuality: number;
  totalTrueMissingPhotos: number;
  missingPhotosDuplicates: number;
  missingPhotosFailedBackfill: number;
  missingPhotosWithBackfillError: number;
};

type LocationPhotoRow = {
  main_image?: string | null;
  image_url?: string | null;
  has_photos?: boolean | null;
  photo_status?: string | null;
  quality_status?: string | null;
  is_searchable?: boolean | null;
  google_place_id?: string | null;
  quality_score?: number | null;
  duplicate_status?: string | null;
  enrichment_status?: string | null;
  photo_backfill_error?: string | null;
};

function hasUsableImageValue(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function rowHasPhotos(row: LocationPhotoRow) {
  return (
    hasUsableImageValue(row.main_image) ||
    hasUsableImageValue(row.image_url) ||
    row.has_photos === true
  );
}

function rowIsTrueMissingPhoto(row: LocationPhotoRow) {
  const hasMainImage = hasUsableImageValue(row.main_image);
  const hasImageUrl = hasUsableImageValue(row.image_url);
  const hasMissingSignal =
    row.has_photos === false ||
    row.photo_status === "missing_photo" ||
    row.quality_status === "needs_photo";

  return !hasMainImage && !hasImageUrl && hasMissingSignal;
}

async function getLocationPhotoStats(): Promise<LocationPhotoStats> {
  const stats: LocationPhotoStats = {
    hasPhotos: 0,
    searchableWithPhotos: 0,
    searchableMissingPhotos: 0,
    nonSearchableMissingPhotos: 0,
    photoBacklogNoGooglePlaceId: 0,
    photoBacklogLowQuality: 0,
    totalTrueMissingPhotos: 0,
    missingPhotosDuplicates: 0,
    missingPhotosFailedBackfill: 0,
    missingPhotosWithBackfillError: 0,
  };
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select(
        "main_image,image_url,has_photos,photo_status,quality_status,is_searchable,google_place_id,quality_score,duplicate_status,enrichment_status,photo_backfill_error",
      )
      .range(from, from + pageSize - 1);

    if (error) {
      console.warn("summary photo stats failed for locations", error.message);
      return stats;
    }

    for (const row of (data || []) as LocationPhotoRow[]) {
      const hasPhotos = rowHasPhotos(row);
      const isTrueMissingPhoto = rowIsTrueMissingPhoto(row);

      if (hasPhotos) stats.hasPhotos += 1;
      if (row.is_searchable === true && hasPhotos) stats.searchableWithPhotos += 1;
      if (!isTrueMissingPhoto) continue;

      stats.totalTrueMissingPhotos += 1;
      if (row.is_searchable === true) {
        stats.searchableMissingPhotos += 1;
      } else {
        stats.nonSearchableMissingPhotos += 1;
      }
      if (row.google_place_id === null) stats.photoBacklogNoGooglePlaceId += 1;
      if (row.quality_score === null || Number(row.quality_score) < 75) {
        stats.photoBacklogLowQuality += 1;
      }
      if (row.duplicate_status !== "unique") stats.missingPhotosDuplicates += 1;
      if (row.enrichment_status === "failed") stats.missingPhotosFailedBackfill += 1;
      if (row.photo_backfill_error !== null) {
        stats.missingPhotosWithBackfillError += 1;
      }
    }

    if (!data || data.length < pageSize) break;
  }

  return stats;
}

async function safeCount(
  table: string,
  filter?: (query: QueryBuilder) => QueryBuilder,
) {
  let query = supabaseAdmin.from(table).select("id", {
    count: "exact",
    head: true,
  });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) {
    console.warn(`summary count failed for ${table}`, error.message);
    return 0;
  }
  return count || 0;
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth) return auth;

  const [
    liveLocations,
    searchableLocations,
    needsReview,
    duplicates,
    staged,
    publishReady,
    possibleDuplicates,
    rejected,
    enrichmentQueued,
    remainingPublishReady,
    remainingUncheckedDedupe,
    needsScoring,
    missingClaimCodes,
    missingClaimQrs,
    missingPublicQrs,
    chains,
    utilityChains,
    photoStats,
    needsPhoto,
    lowLevelLocations,
    lowLevelStaged,
    nycUnverified,
  ] = await Promise.all([
    safeCount("locations"),
    safeCount("locations", (query) => query.eq("is_searchable", true)),
    safeCount("locations", (query) =>
      query.in("quality_status", ["needs_review", "review"]),
    ),
    safeCount("locations", (query) =>
      query.eq("duplicate_status", "duplicate"),
    ),
    safeCount("location_import_staging", (query) =>
      query.eq("import_status", "staged"),
    ),
    safeCount("location_import_staging", (query) =>
      query
        .eq("quality_status", "publish_ready")
        .eq("duplicate_status", "unique")
        .eq("import_status", "staged"),
    ),
    safeCount("location_import_staging", (query) =>
      query.eq("duplicate_status", "possible_duplicate"),
    ),
    safeCount("location_import_staging", (query) =>
      query.or(
        "import_status.eq.rejected,quality_status.eq.reject,duplicate_status.eq.duplicate",
      ),
    ),
    safeCount("locations", (query) =>
      query
        .in("enrichment_status", ["queued", "not_started", "failed"])
        .gte("quality_score", 80),
    ),
    safeCount("location_import_staging", (query) =>
      query
        .eq("import_status", "staged")
        .eq("quality_status", "publish_ready")
        .eq("duplicate_status", "unique"),
    ),
    safeCount("location_import_staging", (query) =>
      query.eq("import_status", "staged").eq("duplicate_status", "unchecked"),
    ),
    safeCount("location_import_staging", (query) =>
      query
        .eq("import_status", "staged")
        .or("quality_status.in.(needs_review,unchecked),quality_score.is.null"),
    ),
    safeCount("locations", (query) =>
      query.eq("is_searchable", true).is("claim_code", null),
    ),
    safeCount("locations", (query) =>
      query
        .eq("is_searchable", true)
        .or("claim_qr_url.is.null,claim_qr_code_url.is.null"),
    ),
    safeCount("locations", (query) =>
      query
        .eq("is_searchable", true)
        .or("qr_code_data_url.is.null,qr_code_url.is.null"),
    ),
    safeCount("locations", (query) => query.eq("is_chain", true)),
    safeCount("locations", (query) =>
      query.eq("is_chain", true).eq("curation_tier", "utility"),
    ),
    getLocationPhotoStats(),
    Promise.all([
      safeCount("locations", (query) =>
        query.eq("quality_status", "needs_photo"),
      ),
      safeCount("location_import_staging", (query) =>
        query.eq("quality_status", "needs_photo"),
      ),
    ]).then(([live, staging]) => live + staging),
    safeCount("locations", (query) => query.eq("is_low_level", true)),
    safeCount("location_import_staging", (query) => query.eq("is_low_level", true)),
    safeCount("locations", (query) => query.eq("low_level_reason", "nyc_import_unverified")),
  ]);

  const {
    hasPhotos,
    searchableWithPhotos,
    searchableMissingPhotos,
    nonSearchableMissingPhotos,
    photoBacklogNoGooglePlaceId,
    photoBacklogLowQuality,
    totalTrueMissingPhotos,
    missingPhotosDuplicates,
    missingPhotosFailedBackfill,
    missingPhotosWithBackfillError,
  } = photoStats;
  const missingPhotos = searchableMissingPhotos;
  const missingPhotosTotal = totalTrueMissingPhotos;
  const missingPhotosSearchable = searchableMissingPhotos;
  const missingPhotosNotSearchable = nonSearchableMissingPhotos;
  const missingPhotosEligibleBackfill = Math.max(
    totalTrueMissingPhotos - photoBacklogNoGooglePlaceId - photoBacklogLowQuality,
    0,
  );
  const missingPhotosLowQuality = photoBacklogLowQuality;

  const { data: latestBatches } = await supabaseAdmin
    .from("location_import_batches")
    .select(
      "id,source,source_label,status,total_seen,total_staged,total_duplicates,total_possible_duplicates,total_rejected,total_publish_ready,total_published,metadata,started_at,completed_at",
    )
    .order("started_at", { ascending: false })
    .limit(20);

  const siteUrlConfigured = Boolean(
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.SITE_URL ||
    process.env.APP_URL,
  );

  return NextResponse.json({
    success: true,
    liveLocations,
    searchableLocations,
    needsReview,
    duplicates,
    staged,
    publishReady,
    possibleDuplicates,
    rejected,
    enrichmentQueued,
    remainingPublishReady,
    remainingUncheckedDedupe,
    needsScoring,
    missingClaimCodes,
    missingClaimQrs,
    missingPublicQrs,
    chains,
    utilityChains,
    missingPhotos,
    hasPhotos,
    needsPhoto,
    searchableWithPhotos,
    missingPhotosTotal,
    missingPhotosSearchable,
    missingPhotosNotSearchable,
    missingPhotosEligibleBackfill,
    missingPhotosLowQuality,
    searchableMissingPhotos,
    nonSearchableMissingPhotos,
    photoBacklogNoGooglePlaceId,
    photoBacklogLowQuality,
    totalTrueMissingPhotos,
    photoStats,
    missingPhotosDuplicates,
    missingPhotosFailedBackfill,
    missingPhotosWithBackfillError,
    lowLevelLocations,
    lowLevelStaged,
    nycUnverified,
    siteUrlConfigured,
    siteUrl: getSiteUrl(),
    latestBatches: latestBatches || [],
  });
}
