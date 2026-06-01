import { hasLocationImage } from "@/lib/locationImage";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function hasLocationPhoto(row: any): boolean {
  return hasLocationImage(row);
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
    row?.google_photo_url ||
    row?.google_place_id ||
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

  return "has_photo";
}
