import { getBestLocationImage } from "@/lib/locations/photo-public";
import { normalizePhotoUrl } from "@/lib/locations/photoValidation";

export function firstImage(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstImage(item);
      if (image) return image;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstImage(record.url ?? record.src ?? record.image_url ?? record.main_image ?? record.primary_photo_url ?? record.google_photo_url ?? record.image ?? record.publicUrl ?? record.public_url ?? record.secure_url ?? record.original_url ?? record.large_url ?? record.medium_url ?? record.thumbnail_url);
  }
  if (typeof value === "string") {
    const normalized = normalizePhotoUrl(value);
    if (!normalized) return null;
    if ((normalized.startsWith("[") && normalized.endsWith("]")) || (normalized.startsWith("{") && normalized.endsWith("}"))) {
      try { return firstImage(JSON.parse(normalized)); } catch {}
    }
    return normalized.split(/[\n,]+/).map((item) => normalizePhotoUrl(item)).find(Boolean) || null;
  }
  return null;
}

export function normalizeImageUrlForPublic(value: unknown): string | null {
  const image = firstImage(value);
  if (!image) return null;
  try {
    const parsed = new URL(image);
    if (parsed.hostname === "maps.googleapis.com" && parsed.pathname.includes("/maps/api/place/photo")) {
      const ref = parsed.searchParams.get("photo_reference") || parsed.searchParams.get("photoreference") || parsed.searchParams.get("ref");
      const maxwidth = parsed.searchParams.get("maxwidth") || "1200";
      if (ref) return `/api/public/google-place-photo?ref=${encodeURIComponent(ref)}&maxwidth=${encodeURIComponent(maxwidth)}`;
    }
  } catch {}
  return image;
}

export function getLocationImage(location: any) {
  return getBestLocationImage(location);
}

export function hasUsableLocationImage(location: any) {
  return Boolean(getLocationImage(location));
}
