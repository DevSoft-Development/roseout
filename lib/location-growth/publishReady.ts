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

function recordValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function trueOptionLabels(value: unknown) {
  const object = recordValue(value);
  return Object.entries(object)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => humanizeKey(key));
}

function normalizedGoogleHours(value: unknown) {
  const object = recordValue(value);
  const descriptions = Array.isArray(object.weekdayDescriptions)
    ? object.weekdayDescriptions
    : Array.isArray(object.weekday_descriptions)
      ? object.weekday_descriptions
      : [];
  if (!descriptions.length) return null;

  const output: Record<string, string[]> = {};
  for (const raw of descriptions) {
    const text = String(raw || "")
      .replace(/[\u00a0\u202f]/g, " ")
      .replace(/\s*[–—-]\s*/g, " - ")
      .replace(/\s+/g, " ")
      .trim();
    const match = text.match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;
    output[match[1].trim().toLowerCase()] = [match[2].trim()];
  }
  return Object.keys(output).length ? output : null;
}

function priceRangeFromGoogle(google: Record<string, any>) {
  const level = Number(google.price_level);
  if (Number.isFinite(level)) {
    if (level === 0) return "Free";
    if (level >= 1 && level <= 4) return "$".repeat(level);
  }
  return null;
}

function googleEnrichment(row: StagingRow) {
  const rawPayload = recordValue(row.raw_payload);
  const google = recordValue(rawPayload.google);
  const parsedAddress = recordValue(rawPayload.parsedAddress);
  const regularHours = recordValue(google.regularOpeningHours);
  const currentHours = recordValue(google.current_opening_hours);
  const operatingHours = normalizedGoogleHours(regularHours) || normalizedGoogleHours(currentHours);
  const parkingLabels = trueOptionLabels(google.parkingOptions);
  const accessibilityLabels = trueOptionLabels(google.accessibilityOptions);

  const featureTags = uniqueStrings([
    google.reservable ? "reservations" : null,
    google.outdoorSeating ? "outdoor seating" : null,
    google.liveMusic ? "live music" : null,
    google.goodForGroups ? "group friendly" : null,
    google.goodForWatchingSports ? "watch sports" : null,
    google.servesCocktails ? "cocktails" : null,
    google.servesBeer ? "beer" : null,
    google.servesWine ? "wine" : null,
    google.servesBreakfast ? "breakfast" : null,
    google.servesBrunch ? "brunch" : null,
    google.servesLunch ? "lunch" : null,
    google.servesDinner ? "dinner" : null,
    google.servesVegetarianFood ? "vegetarian" : null,
    google.servesDessert ? "dessert" : null,
    google.servesCoffee ? "coffee" : null,
    google.dineIn ? "dine in" : null,
    google.takeout ? "takeout" : null,
    google.delivery ? "delivery" : null,
    google.curbsidePickup ? "curbside pickup" : null,
    google.allowsDogs ? "dog friendly" : null,
  ]);

  const placeId = row.source === "google_curated_discovery"
    ? String(row.source_id || "").trim() || null
    : null;

  return {
    placeId,
    google,
    parsedAddress,
    operatingHours,
    regularHours: Object.keys(regularHours).length ? regularHours : null,
    currentHours: Object.keys(currentHours).length ? currentHours : null,
    parkingInfo: parkingLabels.length ? parkingLabels.join(", ") : null,
    accessibilityInfo: accessibilityLabels.length ? accessibilityLabels.join(", ") : null,
    priceRange: priceRangeFromGoogle(google),
    featureTags,
  };
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
  const enrichment = googleEnrichment(row);
  const tags = uniqueStrings([row.tags || [], enrichment.featureTags]);
  const searchKeywords = uniqueStrings([row.search_keywords || [], enrichment.featureTags]);
  const semanticTags = uniqueStrings([row.semantic_tags || [], enrichment.featureTags]);
  const now = new Date().toISOString();

  const base = {
    location_type: row.location_type,
    name: row.name || row.restaurant_name || row.activity_name,
    restaurant_name: row.restaurant_name,
    activity_name: row.activity_name,
    address: row.address,
    city: row.city,
    state: row.state,
    zip_code: row.zip_code,
    borough: enrichment.parsedAddress.borough || row.borough || null,
    neighborhood: enrichment.parsedAddress.neighborhood || row.neighborhood || null,
    phone: row.phone,
    website: row.website,
    latitude: row.latitude,
    longitude: row.longitude,
    primary_category: row.primary_category,
    cuisine: row.cuisine,
    cuisine_type: row.cuisine_type,
    activity_type: row.activity_type,
    primary_tag: row.primary_tag,
    tags,
    semantic_tags: semanticTags,
    vibe_tags: row.vibe_tags || [],
    best_for_tags: row.best_for_tags || [],
    search_keywords: searchKeywords,
    google_types: row.google_types || [],
    rating: row.rating,
    review_count: row.review_count,
    main_image: row.main_image,
    images: row.images || [],
    description: row.description,
    import_source: row.source,
    import_source_id: row.source_id,
    google_place_id: enrichment.placeId || row.google_place_id || null,
    google_primary_type: enrichment.google.primaryType || null,
    google_maps_url: enrichment.google.googleMapsUri || row.source_url || null,
    google_maps_uri: enrichment.google.googleMapsUri || null,
    google_website_uri: enrichment.google.websiteUri || row.website || null,
    google_rating: Number(enrichment.google.rating || row.rating || 0) || null,
    google_user_rating_count: Number(enrichment.google.user_ratings_total || row.review_count || 0) || null,
    google_business_status: enrichment.google.business_status || null,
    google_business_status_checked_at: enrichment.google.business_status ? now : null,
    google_regular_opening_hours: enrichment.regularHours,
    google_current_opening_hours: enrichment.currentHours,
    operating_hours: enrichment.operatingHours,
    hours_raw: enrichment.regularHours || enrichment.currentHours,
    hours_source: enrichment.operatingHours ? "google_places_curated_import" : null,
    hours_confidence: enrichment.operatingHours ? "verified" : null,
    hours_backfill_status: enrichment.operatingHours ? "success" : null,
    hours_last_backfilled_at: enrichment.operatingHours ? now : null,
    price_range: enrichment.priceRange,
    outdoor_seating: enrichment.google.outdoorSeating === true ? true : null,
    live_music: enrichment.google.liveMusic === true ? true : null,
    group_friendly: enrichment.google.goodForGroups === true ? true : null,
    parking_info: enrichment.parkingInfo,
    accessibility_info: enrichment.accessibilityInfo,
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
    low_level_detected_at: lowLevel || unverifiedNyc ? now : null,
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
    last_cleaned_at: now,
    last_deduped_at: now,
  };
  const { update } = buildPublishabilityUpdate(base, { allowApproval: true });
  return { ...base, ...update, data_status: update.is_searchable ? "clean" : base.data_status };
}

async function findExistingLiveDuplicate(row: StagingRow) {
  const filters: string[] = [];
  if (row.location_key) filters.push(`location_key.eq.${row.location_key}`);
  if (row.normalized_name && row.normalized_address) {
    filters.push(`and(normalized_name.eq.${row.normalized_name},normalized_address.eq.${row.normalized_address},city.eq.${row.city},state.eq.${row.state})`);
  }
  if (row.source_id) filters.push(`google_place_id.eq.${row.source_id}`);
  if (row.normalized_phone) filters.push(`normalized_phone.eq.${row.normalized_phone}`);
  if (!filters.length) return null;

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,normalized_name,normalized_phone,location_key,google_place_id,duplicate_status")
    .or(filters.join(","))
    .neq("duplicate_status", "duplicate")
    .limit(10);
  if (error) throw new Error(`Publish final duplicate guard lookup failed: ${error.message}`);

  return (data || []).find((candidate: any) => {
    if (row.location_key && row.location_key === candidate.location_key) return true;
    if (row.source_id && row.source_id === candidate.google_place_id) return true;
    if (row.normalized_phone && row.normalized_phone === candidate.normalized_phone) {
      const stagedTokens = new Set(String(row.normalized_name || "").split(/\s+/).filter(Boolean));
      const candidateTokens = new Set(String(candidate.normalized_name || "").split(/\s+/).filter(Boolean));
      const overlap = [...stagedTokens].filter((token) => candidateTokens.has(token)).length;
      return overlap / Math.max(stagedTokens.size || 1, candidateTokens.size || 1) >= 0.72;
    }
    return true;
  }) || null;
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

  const newRows = [];
  for (const row of rows) {
    if (existingKeys.has(`${row.source}::${row.source_id}`)) continue;
    const duplicate = await findExistingLiveDuplicate(row);
    if (duplicate) {
      await supabaseAdmin.from("location_import_staging").update({
        duplicate_status: "duplicate",
        import_status: "duplicate",
        matched_location_id: duplicate.id,
        rejection_reason: "duplicate_existing_location_final_guard",
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      continue;
    }
    newRows.push(row);
  }
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