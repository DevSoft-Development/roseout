import type { EnterpriseLocation } from "./types";

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
      !lower.includes("placeholder")
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
  const record = location as any;

  return Boolean(
    firstSearchImage(record.image_url) ||
      firstSearchImage(record.main_image) ||
      firstSearchImage(record.photo_url) ||
      firstSearchImage(record.primary_photo_url) ||
      firstSearchImage(record.google_photo_url) ||
      firstSearchImage(record.google_image_url) ||
      firstSearchImage(record.thumbnail_url) ||
      firstSearchImage(record.cover_image_url) ||
      firstSearchImage(record.hero_image_url) ||
      firstSearchImage(record.images) ||
      firstSearchImage(record.gallery_images) ||
      firstSearchImage(record.photos) ||
      firstSearchImage(record.photo_urls) ||
      firstSearchImage(record.google_photos)
  );
}
