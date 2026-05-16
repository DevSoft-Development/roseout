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
};

export function isPubliclyVisible(
  location: LocationVisibilityFields | null | undefined,
) {
  return (
    location?.is_searchable === true &&
    location?.data_status === "clean" &&
    location?.is_hidden !== true &&
    location?.status !== "closed" &&
    location?.status !== "archived"
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
  const hasCleanSearchableData =
    location?.is_searchable === true && location?.data_status === "clean";

  return (
    location?.is_hidden !== true &&
    location?.status !== "closed" &&
    location?.status !== "archived" &&
    hasPublicField(location?.latitude) &&
    hasPublicField(location?.longitude) &&
    hasPublicField(location?.main_image) &&
    (hasCleanSearchableData || hasRequiredPublicSearchFields(location))
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

  if (location?.is_searchable === false) {
    warnings.push("searchable flag is off");
  }

  if (getDataStatus(location) !== "clean") {
    warnings.push(`data status is ${getDataStatus(location)}`);
  }

  warnings.push(...missing);

  return warnings;
}
