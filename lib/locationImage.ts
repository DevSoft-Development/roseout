import {
  getBestPublicLocationImageFromRecord,
  normalizePhotoUrlForPublic,
} from "@/lib/locations/photo-public";

export function firstImage(value: unknown): string | null {
  return normalizePhotoUrlForPublic(value);
}

export function normalizeImageUrlForPublic(value: unknown): string | null {
  return normalizePhotoUrlForPublic(value);
}

export function getLocationImage(location: any) {
  return getBestPublicLocationImageFromRecord(location);
}

export function hasUsableLocationImage(location: any) {
  return Boolean(getLocationImage(location));
}
