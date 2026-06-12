function isBadImageValue(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();

  return (
    !normalized ||
    [
      "null",
      "undefined",
      "none",
      "n/a",
      "missing",
      "no image",
      "no-image",
      "photo coming soon",
      "coming soon",
      "#",
      "?",
    ].includes(normalized) ||
    normalized.includes("placeholder") ||
    normalized.includes("default-image") ||
    normalized.includes("/placeholder") ||
    normalized.includes("photo-coming-soon")
  );
}

function isUsableImageUrl(value: string) {
  const trimmed = value.trim();

  if (isBadImageValue(trimmed)) return false;
  if (trimmed.length <= 8) return false;

  return (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("data:image/")
  );
}

function isSupabaseStorageImage(value: string) {
  return value.includes("/storage/v1/object/public/location-images/");
}

function isGooglePlacesPhotoUrl(value: string) {
  try {
    const parsed = new URL(value);
    return (
      parsed.hostname === "maps.googleapis.com" &&
      parsed.pathname.includes("/maps/api/place/photo")
    );
  } catch {
    return false;
  }
}

function extractGooglePhotoReference(value: string) {
  try {
    const parsed = new URL(value);

    if (
      parsed.hostname === "maps.googleapis.com" &&
      parsed.pathname.includes("/maps/api/place/photo")
    ) {
      return (
        parsed.searchParams.get("photo_reference") ||
        parsed.searchParams.get("photoreference") ||
        parsed.searchParams.get("ref")
      );
    }
  } catch {
    return null;
  }

  return null;
}

function extractGooglePhotoMaxwidth(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.searchParams.get("maxwidth") || "1200";
  } catch {
    return "1200";
  }
}

export function firstImage(value: unknown): string | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstImage(item);
      if (image) return image;
    }

    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (isBadImageValue(trimmed)) return null;

    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        const image = firstImage(parsed);
        if (image) return image;
      } catch {
        // Continue and treat it as a plain URL/string below.
      }
    }

    const directValue = trimmed.split(/[\n,]+/).find((item) => {
      const candidate = item.trim();
      return isUsableImageUrl(candidate);
    });

    return directValue?.trim() || null;
  }

  if (typeof value === "object") {
    const record = value as any;

    return (
      firstImage(record.url) ||
      firstImage(record.src) ||
      firstImage(record.image_url) ||
      firstImage(record.main_image) ||
      firstImage(record.primary_photo_url) ||
      firstImage(record.google_photo_url) ||
      firstImage(record.image) ||
      firstImage(record.publicUrl) ||
      firstImage(record.public_url) ||
      firstImage(record.secure_url) ||
      firstImage(record.original_url) ||
      firstImage(record.large_url) ||
      firstImage(record.medium_url) ||
      firstImage(record.thumbnail_url) ||
      firstImage(record.photoReference) ||
      firstImage(record.photo_reference) ||
      null
    );
  }

  return null;
}

export function normalizeImageUrlForPublic(value: unknown): string | null {
  const image = firstImage(value);
  if (!image) return null;

  if (image.startsWith("/api/public/google-place-photo")) {
    return image;
  }

  const photoReference = extractGooglePhotoReference(image);

  if (photoReference) {
    const maxwidth = extractGooglePhotoMaxwidth(image);

    return `/api/public/google-place-photo?ref=${encodeURIComponent(
      photoReference,
    )}&maxwidth=${encodeURIComponent(maxwidth)}`;
  }

  return image;
}

function collectLocationImageCandidates(location: any) {
  return [
    firstImage(location?.images),
    firstImage(location?.main_image),
    firstImage(location?.image_url),
    firstImage(location?.primary_photo_url),
    firstImage(location?.google_photo_url),
    firstImage(location?.image),
    firstImage(location?.photos),
    firstImage(location?.gallery_images),
    firstImage(location?.gallery),
    firstImage(location?.image_gallery),
  ].filter(Boolean) as string[];
}

export function getLocationImage(location: any) {
  if (!location) return null;

  const candidates = collectLocationImageCandidates(location);

  const storageImage = candidates.find(isSupabaseStorageImage);
  if (storageImage) return normalizeImageUrlForPublic(storageImage);

  const stableNonGoogleImage = candidates.find((image) => !isGooglePlacesPhotoUrl(image));
  if (stableNonGoogleImage) return normalizeImageUrlForPublic(stableNonGoogleImage);

  const placeId =
    typeof location.google_place_id === "string" && location.google_place_id.trim()
      ? location.google_place_id.trim()
      : null;

  if (placeId) {
    return `/api/public/google-place-photo?placeId=${encodeURIComponent(placeId)}&maxwidth=1200`;
  }

  const storedGoogleImage = candidates.find(isGooglePlacesPhotoUrl);
  if (storedGoogleImage) return normalizeImageUrlForPublic(storedGoogleImage);

  return null;
}

export function hasUsableLocationImage(location: any) {
  return Boolean(getLocationImage(location));
}
