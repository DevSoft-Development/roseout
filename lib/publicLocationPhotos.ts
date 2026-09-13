import {
  dedupeLocationPhotos,
  dedupePhotoUrls,
  extractPhotoValues,
  getPhotoDedupeKey,
  getLazyGooglePhotoSlots,
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
  getLazyGooglePhotoSlots,
  isLikelyValidImageUrl,
  normalizePhotoUrl,
};
export type { PublicLocationPhotoRecord };

export function normalizePublicLocationPhotosFromRecord(
  location: PublicLocationPhotoRecord | null,
) {
  return normalizeBase(location);
}

export function getPhotoList(location: PublicLocationPhotoRecord | null) {
  return normalizePublicLocationPhotosFromRecord(location);
}

export function getPrimaryPhoto(location: PublicLocationPhotoRecord | null) {
  return getPhotoList(location)[0] || "";
}
