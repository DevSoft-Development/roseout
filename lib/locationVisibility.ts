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

export function isPublicSearchVisible(
  location: PublicSearchVisibilityFields | null | undefined,
) {
  return (
    isPubliclyVisible(location) &&
    location?.quality_status === "publish_ready" &&
    location?.duplicate_status !== "duplicate" &&
    location?.has_photos === true &&
    location?.photo_status !== "missing_photo" &&
    hasPublicField(location?.address) &&
    hasPublicField(location?.latitude) &&
    hasPublicField(location?.longitude)
  );
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
  location: LocationVisibilityFields | null | undefined,
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

  const status = String(location?.status || "").toLowerCase();

  if (status === "closed" || status === "archived") {
    warnings.push(`status is ${location?.status}`);
  }

  warnings.push(...missing);

  return warnings;
}
