import { getPhotoStatus, hasLocationPhoto } from "@/lib/location-growth/photoDetection";
import { isLowLevelLocation, isUnverifiedNycRestaurant } from "@/lib/search/lowLevel";

type LocationLike = Record<string, any>;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function hasCoordinates(row: LocationLike) {
  return row.latitude != null && row.longitude != null;
}

function hasAddress(row: LocationLike) {
  return Boolean(cleanText(row.address));
}

function hasCategory(row: LocationLike) {
  return Boolean(
    cleanText(row.primary_category) ||
      cleanText(row.cuisine) ||
      cleanText(row.cuisine_type) ||
      cleanText(row.activity_type) ||
      cleanText(row.primary_tag),
  );
}

function isClosedOrArchived(row: LocationLike) {
  const status = cleanText(row.status).toLowerCase();
  return status === "closed" || status === "archived";
}

function isDuplicate(row: LocationLike) {
  return cleanText(row.duplicate_status).toLowerCase() === "duplicate";
}

function isHiddenByTier(row: LocationLike) {
  const publicTier = cleanText(row.public_visibility_tier).toLowerCase();
  const curationTier = cleanText(row.curation_tier).toLowerCase();
  const sourceQuality = cleanText(row.source_quality_status).toLowerCase();
  const confidence = cleanText(row.import_confidence).toLowerCase();

  return (
    row.is_hidden === true ||
    row.is_low_level === true ||
    publicTier === "hidden" ||
    publicTier === "low_level" ||
    curationTier === "low_level" ||
    confidence === "low" ||
    [
      "imported_unverified",
      "generic_restaurant",
      "needs_enrichment",
      "low_level_review",
    ].includes(sourceQuality)
  );
}

export function getPhotoPublishabilityUpdates(row: LocationLike) {
  const hasPhotos = hasLocationPhoto(row);
  const photoStatus = hasPhotos ? getPhotoStatus(row) : "missing_photo";

  const guardedRow = {
    ...row,
    has_photos: hasPhotos,
    photo_status: photoStatus,
  };

  const lowLevel =
    isLowLevelLocation(guardedRow) || isUnverifiedNycRestaurant(guardedRow);

  const baseUpdates: Record<string, any> = {
    has_photos: hasPhotos,
    photo_status: photoStatus,
    updated_at: new Date().toISOString(),
  };

  if (!hasPhotos) {
    return {
      ...baseUpdates,
      quality_status: "needs_photo",
      data_status: "needs_review",
      is_searchable: false,
    };
  }

  const canPublish =
    hasAddress(row) &&
    hasCoordinates(row) &&
    hasCategory(row) &&
    !isDuplicate(row) &&
    !isClosedOrArchived(row) &&
    !isHiddenByTier(row) &&
    !lowLevel;

  if (canPublish) {
    return {
      ...baseUpdates,
      quality_status: "publish_ready",
      data_status: "clean",
      is_searchable: true,
    };
  }

  return {
    ...baseUpdates,
    quality_status: row.quality_status === "needs_photo" ? "review" : row.quality_status,
    data_status: row.data_status === "clean" ? "clean" : "needs_review",
    is_searchable: false,
  };
}
