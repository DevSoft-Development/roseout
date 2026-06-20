export const TOH_IMAGE_FALLBACK = "/toh_logo.png";

export function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (!url) return false;
  const lowered = url.toLowerCase();
  if (["null", "undefined", "none", "n/a", "na", "#", "?"].includes(lowered)) return false;
  if (lowered.includes("placeholder")) return false;
  if (lowered.includes("photo unavailable")) return false;
  if (lowered.includes("photo coming soon")) return false;
  if (lowered.includes("missing_photo")) return false;
  if (lowered.includes("missing-photo")) return false;
  if (lowered.includes("no-photo")) return false;
  if (lowered.includes("no_image")) return false;
  if (lowered.includes("no-image")) return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/");
}

function normalizeMaybeJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

export function extractLocationImage(location: any): string {
  const directCandidates = [location?.image_url, location?.main_image, location?.photo_url, location?.thumbnail_url, location?.cover_image, location?.cover_image_url, location?.primary_photo_url, location?.google_photo_url];
  for (const candidate of directCandidates) if (isUsableImageUrl(candidate)) return candidate.trim();
  const arrayCandidates = [location?.images, location?.gallery_images, location?.photos, location?.photo_urls, location?.google_photos];
  for (const candidateArray of arrayCandidates) {
    for (const candidate of normalizeMaybeJsonArray(candidateArray)) {
      if (isUsableImageUrl(candidate)) return candidate.trim();
      if (candidate && typeof candidate === "object") {
        const nested = (candidate as any).url || (candidate as any).image_url || (candidate as any).src || (candidate as any).photo_url || (candidate as any).main_image;
        if (isUsableImageUrl(nested)) return String(nested).trim();
      }
    }
  }
  return TOH_IMAGE_FALLBACK;
}

export function hasUsableLocationImage(location: any): boolean {
  return extractLocationImage(location) !== TOH_IMAGE_FALLBACK;
}

export function getLocationImageDebug(location: any) {
  const images = normalizeMaybeJsonArray(location?.images);
  const galleryImages = normalizeMaybeJsonArray(location?.gallery_images);
  return {
    image_url: location?.image_url ?? null,
    main_image: location?.main_image ?? null,
    images_count: images.length,
    gallery_images_count: galleryImages.length,
    extracted_image: extractLocationImage(location),
    has_usable_image: hasUsableLocationImage(location),
  };
}
