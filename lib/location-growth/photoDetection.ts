/* eslint-disable @typescript-eslint/no-explicit-any */

import { getMissingPhotoStatusFromRecord, getPublicLocationPhotosFromRecord } from "@/lib/locations/photos";

export function hasLocationPhoto(row: any): boolean {
  return getMissingPhotoStatusFromRecord(row).hasPublicPhoto;
}

export function getPhotoStatus(row: any): string {
  if (!hasLocationPhoto(row)) return "missing_photo";

  const currentStatus = String(row?.photo_status ?? "").toLowerCase();
  if (["admin_photo", "owner_photo", "google_photo", "imported_photo", "storage_cached", "has_photo"].includes(currentStatus)) return currentStatus;

  const photos = getPublicLocationPhotosFromRecord(row);
  const primary = photos[0];
  if (primary?.source === "upload") return "storage_cached";
  if (primary?.source === "google" || primary?.source === "cached_google") return "google_photo";

  const uploadedBy = String(row?.photo_uploaded_by ?? row?.image_uploaded_by ?? row?.main_image_uploaded_by ?? "").toLowerCase();
  if (uploadedBy.includes("owner")) return "owner_photo";
  if (uploadedBy.includes("admin")) return "admin_photo";

  const source = String(row?.photo_source ?? row?.image_source ?? row?.main_image_source ?? row?.source ?? row?.import_source ?? "").toLowerCase();
  if (source.includes("google")) return "google_photo";
  if (source.includes("import") || ["nyc_open_data", "osm", "google_places"].includes(source)) return "imported_photo";
  return "has_photo";
}
