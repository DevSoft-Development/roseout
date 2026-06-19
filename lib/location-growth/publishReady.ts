/* eslint-disable @typescript-eslint/no-explicit-any */
import { detectChainBrand } from "@/lib/location-growth/chainDetection";
import {
  getPhotoStatus,
  hasLocationPhoto,
} from "@/lib/location-growth/photoDetection";
import { isLowLevelLocation, isUnverifiedNycRestaurant } from "@/lib/search/lowLevel";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildPublishabilityUpdate } from "@/lib/location-publishability";

// Supabase rows are intentionally dynamic because this project does not ship
// generated database types for the location growth tables.
type StagingRow = Record<string, any>;

type PublishReadyResult = {
  inserted: number;
  markedPublished: number;
  skipped: number;
  errors: string[];
};

function toBoundedLimit(limit: number) {
  const numeric = Number(limit || 500);
  if (!Number.isFinite(numeric)) return 500;
  return Math.min(Math.max(Math.trunc(numeric), 1), 500);
}

function toLocationInsert(row: StagingRow) {
  const hasPhotos = hasLocationPhoto(row);
  const photoStatus = hasPhotos ? getPhotoStatus(row) : "missing_photo";
  const chain = detectChainBrand(
    String(row.name || row.restaurant_name || row.activity_name || ""),
  );
  const lowLevel = isLowLevelLocation({ ...row, has_photos: hasPhotos, photo_status: photoStatus });
  const unverifiedNyc = isUnverifiedNycRestaurant({ ...row, has_photos: hasPhotos, photo_status: photoStatus });
  const publishReady = hasPhotos && row.quality_status === "publish_ready" && !lowLevel && !unverifiedNyc;
  const base = {
    location_type: row.location_type,
    name: row.name || row.restaurant_name || row.activity_name,
    restaurant_name: row.restaurant_name,
    activity_name: row.activity_name,
    address: row.address,
    city: row.city,
    state: row.state,
    zip_code: row.zip_code,
    phone: row.phone,
    website: row.website,
    latitude: row.latitude,
    longitude: row.longitude,
    primary_category: row.primary_category,
    cuisine: row.cuisine,
    cuisine_type: row.cuisine_type,
    activity_type: row.activity_type,
    primary_tag: row.primary_tag,
    tags: row.tags || [],
    vibe_tags: row.vibe_tags || [],
    best_for_tags: row.best_for_tags || [],
    search_keywords: row.search_keywords || [],
    google_types: row.google_types || [],
    rating: row.rating,
    review_count: row.review_count,
    main_image: row.main_image,
    images: row.images || [],
    description: row.description,
    import_source: row.source,
    import_source_id: row.source_id,
    normalized_name: row.normalized_name,
    normalized_address: row.normalized_address,
    normalized_phone: row.normalized_phone,
    location_key: row.location_key,
    quality_score: row.quality_score,
    quality_status: publishReady ? "publish_ready" : "needs_photo",
    duplicate_status: "unique",
    data_status: publishReady ? "clean" : "needs_review",
    is_searchable: publishReady,
    has_photos: hasPhotos,
    photo_status: photoStatus,
    is_chain: chain.isChain,
    brand_type: chain.isChain ? "chain" : "independent",
    chain_brand: chain.chainBrand,
    curation_tier: chain.isChain ? "utility" : row.curation_tier || "standard",
    date_score: chain.isChain ? 20 : (row.date_score ?? 50),
    search_boost: chain.isChain ? -25 : (row.search_boost ?? 0),
    is_featured: chain.isChain || lowLevel || unverifiedNyc ? false : row.is_featured,
    is_low_level: lowLevel || unverifiedNyc,
    low_level_reason: unverifiedNyc ? "nyc_import_unverified" : lowLevel ? row.low_level_reason || "low_level_review" : null,
    low_level_detected_at: lowLevel || unverifiedNyc ? new Date().toISOString() : null,
    low_level_source: lowLevel || unverifiedNyc ? "publish_guard" : null,
    public_visibility_tier: lowLevel || unverifiedNyc ? "hidden" : row.public_visibility_tier || "standard",
    import_confidence: lowLevel || unverifiedNyc ? "low" : row.import_confidence || "unknown",
    source_quality_status: unverifiedNyc ? "imported_unverified" : lowLevel ? "low_level_review" : row.source_quality_status || "unknown",
    enrichment_status:
      Number(row.quality_score || 0) >= 85 ? "queued" : "not_started",
    enrichment_priority:
      Number(row.review_count || 0) >= 100
        ? 100
        : Number(row.rating || 0) >= 4.5
          ? 90
          : Number(row.quality_score || 0) >= 85
            ? 80
            : 50,
    last_cleaned_at: new Date().toISOString(),
    last_deduped_at: new Date().toISOString(),
  };
  const { update } = buildPublishabilityUpdate(base, { allowApproval: true });
  return { ...base, ...update, data_status: update.is_searchable ? "clean" : base.data_status };
}

export async function publishReadyStagedLocations({
  limit,
  batchId,
}: {
  limit: number;
  batchId?: string | null;
}): Promise<PublishReadyResult> {
  const safeLimit = toBoundedLimit(limit);
  const errors: string[] = [];

  let query = supabaseAdmin
    .from("location_import_staging")
    .select("*")
    .eq("import_status", "staged")
    .eq("quality_status", "publish_ready")
    .eq("duplicate_status", "unique")
    .or("is_low_level.is.null,is_low_level.eq.false")
    .not("public_visibility_tier", "in", '("low_level","hidden")')
    .not("source_quality_status", "in", '("imported_unverified","generic_restaurant","needs_enrichment","low_level_review")')
    .not("import_confidence", "eq", "low")
    .not("address", "is", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .not("primary_category", "is", null)
    .eq("has_photos", true)
    .not("photo_status", "eq", "missing_photo")
    .order("quality_score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(safeLimit);

  if (batchId) query = query.eq("batch_id", batchId);

  const { data: readyRows, error: readyError } = await query;
  if (readyError)
    throw new Error(`Publish fallback select failed: ${readyError.message}`);

  const rows = (readyRows || []) as StagingRow[];
  if (!rows.length)
    return { inserted: 0, markedPublished: 0, skipped: 0, errors };

  const sourceFilters = rows
    .map((row) => {
      const source = String(row.source || "").replace(/"/g, "");
      const sourceId = String(row.source_id || "").replace(/"/g, "");
      return source && sourceId
        ? `and(import_source.eq.${source},import_source_id.eq.${sourceId})`
        : null;
    })
    .filter(Boolean)
    .join(",");

  const existingKeys = new Set<string>();
  if (sourceFilters) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("locations")
      .select("import_source,import_source_id")
      .or(sourceFilters);

    if (existingError) {
      errors.push(`Existing location lookup failed: ${existingError.message}`);
    } else {
      for (const row of existing || []) {
        existingKeys.add(`${row.import_source}::${row.import_source_id}`);
      }
    }
  }

  const newRows = rows.filter(
    (row) => !existingKeys.has(`${row.source}::${row.source_id}`),
  );
  const insertRows = newRows.map(toLocationInsert);
  let inserted = 0;

  if (insertRows.length) {
    const { data: insertedRows, error: insertError } = await supabaseAdmin
      .from("locations")
      .insert(insertRows)
      .select("import_source,import_source_id");

    if (insertError) {
      throw new Error(`Publish fallback insert failed: ${insertError.message}`);
    }

    for (const row of insertedRows || []) {
      existingKeys.add(`${row.import_source}::${row.import_source_id}`);
    }
    inserted = insertedRows?.length || 0;
  }

  const publishedIds = rows
    .filter((row) => existingKeys.has(`${row.source}::${row.source_id}`))
    .map((row) => row.id)
    .filter(Boolean);

  let markedPublished = 0;
  if (publishedIds.length) {
    const { data: markedRows, error: markError } = await supabaseAdmin
      .from("location_import_staging")
      .update({
        import_status: "published",
        updated_at: new Date().toISOString(),
      })
      .in("id", publishedIds)
      .select("id");

    if (markError) {
      throw new Error(
        `Publish fallback mark published failed: ${markError.message}`,
      );
    }
    markedPublished = markedRows?.length || 0;
  }

  return {
    inserted,
    markedPublished,
    skipped: rows.length - markedPublished,
    errors,
  };
}
