import {
  dedupeLocationPhotos,
  getBestLocationImage,
  getPublicLocationPhotosFromRecord,
  normalizeLocationPhotoList,
} from "@/lib/locations/photos";
import { getPhotoDedupeKey, isLikelyValidImageUrl, normalizePhotoUrl } from "@/lib/locations/photoValidation";

export type PublicLocationPhotoRecord = Record<string, unknown> & {
  main_image?: string | null;
  image_url?: string | null;
};

export function extractPhotoValues(value: unknown): unknown[] {
  return normalizeLocationPhotoList(value).map((photo) => photo.url);
}

export { getPhotoDedupeKey, isLikelyValidImageUrl, normalizePhotoUrl };

export function dedupePhotoUrls(values: unknown[]) {
  return dedupeLocationPhotos(normalizeLocationPhotoList(values)).map((photo) => photo.url);
}

export function getPhotoList(location: PublicLocationPhotoRecord | null) {
  return getPublicLocationPhotosFromRecord(location).map((photo) => photo.url).slice(0, 5);
}

export function getPrimaryPhoto(location: PublicLocationPhotoRecord | null) {
  return getBestLocationImage(location) || "";
}
