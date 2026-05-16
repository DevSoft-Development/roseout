export type LocationVisibilityFields = {
  is_searchable?: boolean | null;
  data_status?: string | null;
  missing_fields?: string[] | null;
  is_hidden?: boolean | null;
  status?: string | null;
  last_quality_check_at?: string | null;
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
