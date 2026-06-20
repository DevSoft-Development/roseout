import type { EnterpriseLocation } from "./types";
import { isUsableImageUrl, hasUsableLocationImage } from "@/lib/location-images";

export function firstSearchImage(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return firstSearchImage(JSON.parse(trimmed));
      } catch {
        // Keep evaluating as a normal string below.
      }
    }

    const lower = trimmed.toLowerCase();
    return trimmed &&
      !["null", "undefined", "none", "n/a", "na", "#", "?"].includes(
        lower,
      ) &&
      isUsableImageUrl(trimmed)
      ? trimmed
      : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstSearchImage(item);
      if (image) return image;
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as any;
    return firstSearchImage(
      record.url ||
        record.src ||
        record.image_url ||
        record.main_image ||
        record.photo_url ||
        record.primary_photo_url ||
        record.google_photo_url,
    );
  }

  return null;
}

export function hasUsableSearchPhoto(location: EnterpriseLocation) {
  return hasUsableLocationImage(location);
}
