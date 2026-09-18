/* eslint-disable @typescript-eslint/no-explicit-any */

function hasTextPhoto(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasArrayPhoto(value: unknown) {
  return (
    Array.isArray(value) &&
    value.some((item) => hasTextPhoto(item) || Boolean(item))
  );
}

export function hasLocationPhoto(row: any): boolean {
  if (!row) return false;
  return (
    hasTextPhoto(row.main_image) ||
    hasTextPhoto(row.image_url) ||
    hasTextPhoto(row.photo_url) ||
    hasArrayPhoto(row.photos) ||
    hasArrayPhoto(row.images) ||
    hasArrayPhoto(row.gallery_images) ||
    hasArrayPhoto(row.gallery_image_urls) ||
    hasArrayPhoto(row.photo_urls)
  );
}

export function getPhotoStatus(row: any): string {
  if (!hasLocationPhoto(row)) return "missing_photo";

  const uploadedBy = String(
    row?.photo_uploaded_by ??
      row?.image_uploaded_by ??
      row?.main_image_uploaded_by ??
      "",
  ).toLowerCase();
  const source = String(
    row?.photo_source ??
      row?.image_source ??
      row?.main_image_source ??
      row?.source ??
      row?.import_source ??
      "",
  ).toLowerCase();

  const currentStatus = String(row?.photo_status ?? "").toLowerCase();
  if ([
    "admin_photo",
    "owner_photo",
    "google_photo",
    "imported_photo",
    "storage_cached",
    "has_photo",
  ].includes(currentStatus)) {
    return currentStatus;
  }

  const mainImage = String(row?.main_image ?? row?.image_url ?? "").toLowerCase();
  if (mainImage.includes("storage/v1/object/public")) {
    return "storage_cached";
  }

  if (
    row?.owner_photo ||
    row?.owner_uploaded_photo ||
    uploadedBy.includes("owner")
  ) {
    return "owner_photo";
  }
  if (
    row?.admin_photo ||
    row?.admin_uploaded_photo ||
    uploadedBy.includes("admin")
  ) {
    return "admin_photo";
  }
  if (
    row?.google_photo ||
    hasTextPhoto(row?.google_photo_url) ||
    hasArrayPhoto(row?.google_photos) ||
    source.includes("google")
  ) {
    return "google_photo";
  }
  if (
    row?.imported_photo ||
    source.includes("import") ||
    ["nyc_open_data", "osm", "google_places"].includes(source)
  ) {
    return "imported_photo";
  }

  if (source.includes("storage") || source.includes("cached")) {
    return "storage_cached";
  }

  return "has_photo";
}
