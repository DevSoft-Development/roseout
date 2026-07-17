import { getPhotoStatus, hasLocationPhoto } from "@/lib/location-growth/photoDetection";
import { isLowLevelLocation, isUnverifiedNycRestaurant } from "@/lib/search/lowLevel";

type LocationLike = Record<string, any>;

const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();

function hasCoordinates(row: LocationLike) {
  return row.latitude != null && row.longitude != null;
}

function hasAddress(row: LocationLike) {
  return Boolean(text(row.address));
}

function hasCategory(row: LocationLike) {
  return Boolean(text(row.primary_category) || text(row.cuisine) || text(row.cuisine_type) || text(row.activity_type) || text(row.primary_tag));
}

function isClosedOrArchived(row: LocationLike) {
  return ["closed", "archived"].includes(lower(row.status));
}

function isDuplicate(row: LocationLike) {
  return lower(row.duplicate_status) === "duplicate";
}

function hasCompletedEnrichment(row: LocationLike) {
  const source = lower(row.import_source || row.source || row.source_table);
  const isNyc = source.includes("nyc") || source.includes("open_data") || source.includes("opendata");
  const enrichmentComplete = ["completed", "enriched"].includes(lower(row.enrichment_status)) || Boolean(row.last_enriched_at);
  const googleEvidence = Boolean(row.google_place_id) && Number(row.rating || 0) > 0 && Number(row.review_count || 0) > 0;
  return isNyc && enrichmentComplete && googleEvidence && hasLocationPhoto(row);
}

function isHiddenByTier(row: LocationLike, enrichedNyc: boolean) {
  const publicTier = lower(row.public_visibility_tier);
  const curationTier = lower(row.curation_tier);
  const sourceQuality = lower(row.source_quality_status);
  const confidence = lower(row.import_confidence);

  if (curationTier === "low_level") return true;
  if (!enrichedNyc && (row.is_hidden === true || row.is_low_level === true)) return true;
  if (!enrichedNyc && ["hidden", "low_level"].includes(publicTier)) return true;
  if (!enrichedNyc && confidence === "low") return true;
  if (!enrichedNyc && ["imported_unverified", "generic_restaurant", "needs_enrichment", "low_level_review"].includes(sourceQuality)) return true;
  return false;
}

export function getPhotoPublishabilityUpdates(row: LocationLike) {
  const hasPhotos = hasLocationPhoto(row);
  const photoStatus = hasPhotos ? getPhotoStatus(row) : "missing_photo";
  const enrichedNyc = hasCompletedEnrichment({ ...row, has_photos: hasPhotos, photo_status: photoStatus });
  const guardedRow = enrichedNyc
    ? {
        ...row,
        has_photos: hasPhotos,
        photo_status: photoStatus,
        is_hidden: false,
        is_low_level: false,
        public_visibility_tier: "standard",
        source_quality_status: "enriched",
        import_confidence: "high",
        low_level_reason: null,
      }
    : { ...row, has_photos: hasPhotos, photo_status: photoStatus };

  const lowLevel = isLowLevelLocation(guardedRow) || isUnverifiedNycRestaurant(guardedRow);
  const baseUpdates: Record<string, any> = {
    has_photos: hasPhotos,
    photo_status: photoStatus,
    updated_at: new Date().toISOString(),
  };

  if (enrichedNyc) {
    Object.assign(baseUpdates, {
      is_hidden: false,
      is_low_level: false,
      public_visibility_tier: "standard",
      source_quality_status: "enriched",
      import_confidence: "high",
      low_level_reason: null,
      low_level_source: null,
      search_boost: Math.max(Number(row.search_boost || 0), 0),
    });
  }

  if (!hasPhotos) {
    return { ...baseUpdates, quality_status: "needs_photo", data_status: "needs_review", is_searchable: false };
  }

  const canPublish = hasAddress(row) && hasCoordinates(row) && hasCategory(row) && !isDuplicate(row) && !isClosedOrArchived(row) && !isHiddenByTier(row, enrichedNyc) && !lowLevel;

  if (canPublish) {
    return { ...baseUpdates, quality_status: "publish_ready", data_status: "clean", is_searchable: true };
  }

  return {
    ...baseUpdates,
    quality_status: row.quality_status === "needs_photo" ? "review" : row.quality_status,
    data_status: row.data_status === "clean" ? "clean" : "needs_review",
    is_searchable: false,
  };
}
