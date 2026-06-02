export type LocationVisibilityFields = {
  is_searchable?: boolean | null;
  data_status?: string | null;
  missing_fields?: string[] | null;
  is_hidden?: boolean | null;
  status?: string | null;
  last_quality_check_at?: string | null;
};

export type PublicSearchVisibilityFields = LocationVisibilityFields & {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  main_image?: string | null;
  image_url?: string | null;
  photo_url?: string | null;
  images?: string[] | null;
  photos?: string[] | null;
  gallery_images?: string[] | null;
  gallery_image_urls?: string[] | null;
  photo_urls?: string[] | null;
  quality_status?: string | null;
  duplicate_status?: string | null;
  has_photos?: boolean | null;
  photo_status?: string | null;
  is_low_level?: boolean | null;
  public_visibility_tier?: string | null;
  curation_tier?: string | null;
  low_level_reason?: string | null;
  import_confidence?: string | null;
  source_quality_status?: string | null;
  rating?: number | string | null;
  review_count?: number | string | null;
};

export type PublicSearchVisibilityOptions = {
  allowLowLevel?: boolean;
  allowUnverifiedImports?: boolean;
};

export function isPubliclyVisible(
  location: LocationVisibilityFields | null | undefined,
) {
  const status = String(location?.status || "").toLowerCase();

  return (
    location?.is_searchable === true &&
    location?.data_status === "clean" &&
    location?.is_hidden !== true &&
    status !== "closed" &&
    status !== "archived"
  );
}

function hasPublicField(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.trim().length > 0;
}

export function hasRequiredPublicSearchFields(
  location: PublicSearchVisibilityFields | null | undefined,
) {
  return (
    hasPublicField(location?.name) &&
    hasPublicField(location?.address) &&
    hasPublicField(location?.city) &&
    hasPublicField(location?.state) &&
    hasPublicField(location?.latitude) &&
    hasPublicField(location?.longitude) &&
    hasPublicField(location?.main_image)
  );
}

function normalized(value: string | null | undefined) {
  return String(value || "").toLowerCase();
}

export function isPublicSearchVisible(
  location: PublicSearchVisibilityFields | null | undefined,
  options: PublicSearchVisibilityOptions = {},
) {
  const { allowLowLevel = false, allowUnverifiedImports = false } = options;
  const publicTier = normalized(location?.public_visibility_tier);
  const curationTier = normalized(location?.curation_tier);
  const sourceQualityStatus = normalized(location?.source_quality_status);
  const importConfidence = normalized(location?.import_confidence);

  if (!isPubliclyVisible(location)) return false;
  if (location?.quality_status !== "publish_ready") return false;
  if (location?.duplicate_status === "duplicate") return false;
  if (location?.has_photos !== true) return false;
  if (location?.photo_status === "missing_photo") return false;
  if (!hasPublicField(location?.address)) return false;
  if (!hasPublicField(location?.latitude)) return false;
  if (!hasPublicField(location?.longitude)) return false;
  if (!allowLowLevel && location?.is_low_level === true) return false;
  if (!allowLowLevel && ["low_level", "hidden"].includes(publicTier)) return false;
  if (!allowLowLevel && curationTier === "low_level") return false;
  if (!allowUnverifiedImports && ["imported_unverified", "generic_restaurant", "needs_enrichment"].includes(sourceQualityStatus)) return false;
  if (!allowUnverifiedImports && importConfidence === "low") return false;

  return true;
}

export function getDataStatus(
  location: LocationVisibilityFields | null | undefined,
) {
  return location?.data_status || "needs_review";
}

export function getMissingFields(
  location: LocationVisibilityFields | null | undefined,
) {
  return Array.isArray(location?.missing_fields) ? location.missing_fields : [];
}

export function getPublicVisibilityWarning(
  location: PublicSearchVisibilityFields | null | undefined,
) {
  const missing = getMissingFields(location);
  const warnings = [];

  if (location?.is_searchable !== true) {
    warnings.push("is_searchable is not true");
  }

  if (getDataStatus(location) !== "clean") {
    warnings.push(`data_status is ${getDataStatus(location)}`);
  }

  if (location?.is_hidden === true) {
    warnings.push("is_hidden is true");
  }

  if (location?.is_low_level === true) warnings.push("is low-level");

  if (["hidden", "low_level"].includes(normalized(location?.public_visibility_tier))) {
    warnings.push(`public visibility tier is ${location?.public_visibility_tier}`);
  }

  if (normalized(location?.curation_tier) === "low_level") {
    warnings.push("curation tier is low_level");
  }

  if (["imported_unverified", "generic_restaurant", "needs_enrichment"].includes(normalized(location?.source_quality_status))) {
    warnings.push(`source quality status is ${location?.source_quality_status}`);
  }

  if (location?.has_photos !== true || location?.photo_status === "missing_photo") {
    warnings.push("missing photo");
  }

  if (location?.rating == null || location?.review_count == null) {
    warnings.push("missing rating/review count");
  }

  const status = String(location?.status || "").toLowerCase();

  if (status === "closed" || status === "archived") {
    warnings.push(`status is ${location?.status}`);
  }

  warnings.push(...missing);

  return warnings;
}
