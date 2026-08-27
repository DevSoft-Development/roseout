import {
  dedupeLocationPhotos,
  dedupePhotoUrls,
  extractPhotoValues,
  getPhotoDedupeKey,
  isLikelyValidImageUrl,
  normalizePhotoUrl,
  normalizePublicLocationPhotosFromRecord as normalizeBase,
  type PublicLocationPhotoRecord,
} from "@/lib/locations/photo-public";

export {
  dedupePhotoUrls,
  dedupeLocationPhotos,
  extractPhotoValues,
  getPhotoDedupeKey,
  isLikelyValidImageUrl,
  normalizePhotoUrl,
};
export type { PublicLocationPhotoRecord };

function clean(value: unknown) {
  return String(value || "").trim();
}

function isLegacyPersistedGooglePhoto(value: unknown) {
  const url = clean(value).toLowerCase();
  if (!url) return false;
  return (
    url.includes("/storage/v1/object/public/location-images/") &&
    (url.includes("/google-") ||
      url.includes("/migrated-google-") ||
      url.includes("/cached-google-") ||
      url.includes("/google_places-"))
  );
}

function filterLegacyGoogleValues(value: unknown): unknown {
  if (!value) return value;
  if (Array.isArray(value)) {
    return value.filter((item) => !isLegacyPersistedGooglePhoto(item));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isLegacyPersistedGooglePhoto(trimmed)) return null;
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter((item) => !isLegacyPersistedGooglePhoto(item));
      } catch {
        // Keep non-JSON strings unchanged.
      }
    }
  }
  return value;
}

function publicPhotoRecord(record: PublicLocationPhotoRecord | null) {
  if (!record) return null;
  const photoSource = clean(record.photo_source).toLowerCase();
  const hasGooglePlaceId = Boolean(clean(record.google_place_id));
  if (!hasGooglePlaceId || !photoSource.startsWith("google")) return record;

  const next: PublicLocationPhotoRecord = { ...record };
  const fields = [
    "main_image",
    "image_url",
    "images",
    "photos",
    "gallery_images",
    "photo_urls",
    "image_urls",
    "main_images",
    "cached_photo_url",
    "cached_photo_urls",
    "google_photo_url",
    "google_photo_urls",
  ];
  for (const field of fields) {
    next[field] = filterLegacyGoogleValues(next[field]);
  }
  return next;
}

export function normalizePublicLocationPhotosFromRecord(
  location: PublicLocationPhotoRecord | null,
) {
  return normalizeBase(publicPhotoRecord(location));
}

export function getPhotoList(location: PublicLocationPhotoRecord | null) {
  return normalizePublicLocationPhotosFromRecord(location);
}

export function getPrimaryPhoto(location: PublicLocationPhotoRecord | null) {
  return getPhotoList(location)[0] || "";
}
