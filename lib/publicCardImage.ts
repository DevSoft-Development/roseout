import {
  hasPublicCardImage as hasPublicCardImageFromRecord,
  normalizePublicCardImageRecord,
} from "@/lib/locations/photo-public";

export function normalizePublicCardImage<T extends Record<string, any>>(
  item: T,
): T {
  return normalizePublicCardImageRecord(item);
}

export function hasPublicCardImage(item: any) {
  return hasPublicCardImageFromRecord(item);
}
