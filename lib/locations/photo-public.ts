// Client-safe pure photo helpers. Do not import server-only modules here.

export type PublicLocationPhotoRecord = Record<string, unknown> & {
  main_image?: string | null;
  image_url?: string | null;
};

export type PublicLocationPhoto = {
  id?: string;
  url: string;
  alt?: string;
  source?: "upload" | "google" | "cached_google" | "fallback" | "external" | string;
  isPrimary?: boolean;
  sortOrder?: number;
};

function isBadImageValue(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

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

export function firstPhoto(value: unknown): string | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstPhoto(item);
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
        const image = firstPhoto(JSON.parse(trimmed));
        if (image) return image;
      } catch {
        // Continue and treat it as a plain URL/string below.
      }
    }

    const directValue = trimmed
      .split(/[\n,]+/)
      .find((item) => isUsableImageUrl(item.trim()));
    return directValue?.trim() || null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    return (
      firstPhoto(record.url) ||
      firstPhoto(record.src) ||
      firstPhoto(record.image_url) ||
      firstPhoto(record.main_image) ||
      firstPhoto(record.primary_photo_url) ||
      firstPhoto(record.google_photo_url) ||
      firstPhoto(record.image) ||
      firstPhoto(record.publicUrl) ||
      firstPhoto(record.public_url) ||
      firstPhoto(record.secure_url) ||
      firstPhoto(record.original_url) ||
      firstPhoto(record.large_url) ||
      firstPhoto(record.medium_url) ||
      firstPhoto(record.thumbnail_url) ||
      firstPhoto(record.photoReference) ||
      firstPhoto(record.photo_reference) ||
      null
    );
  }

  return null;
}

export function normalizePhotoUrlForPublic(value: unknown): string | null {
  const image = firstPhoto(value);
  if (!image) return null;

  if (image.startsWith("/api/public/google-place-photo")) return image;

  const photoReference = extractGooglePhotoReference(image);
  if (photoReference) {
    const maxwidth = extractGooglePhotoMaxwidth(image);
    return `/api/public/google-place-photo?ref=${encodeURIComponent(photoReference)}&maxwidth=${encodeURIComponent(maxwidth)}`;
  }

  return image;
}

function collectLocationImageCandidates(
  location: Record<string, unknown> | null | undefined,
) {
  return [
    firstPhoto(location?.images),
    firstPhoto(location?.main_image),
    firstPhoto(location?.image_url),
    firstPhoto(location?.primary_photo_url),
    firstPhoto(location?.google_photo_url),
    firstPhoto(location?.image),
    firstPhoto(location?.photos),
    firstPhoto(location?.gallery_images),
    firstPhoto(location?.gallery),
    firstPhoto(location?.image_gallery),
  ].filter(Boolean) as string[];
}

export function getBestPublicLocationImageFromRecord(
  location: Record<string, unknown> | null | undefined,
) {
  if (!location) return null;

  const candidates = collectLocationImageCandidates(location);
  const storageImage = candidates.find(isSupabaseStorageImage);
  if (storageImage) return normalizePhotoUrlForPublic(storageImage);

  const stableNonGoogleImage = candidates.find(
    (image) => !isGooglePlacesPhotoUrl(image),
  );
  if (stableNonGoogleImage)
    return normalizePhotoUrlForPublic(stableNonGoogleImage);

  const placeId =
    typeof location.google_place_id === "string" &&
    location.google_place_id.trim()
      ? location.google_place_id.trim()
      : null;
  if (placeId)
    return `/api/public/google-place-photo?placeId=${encodeURIComponent(placeId)}&maxwidth=1200`;

  const storedGoogleImage = candidates.find(isGooglePlacesPhotoUrl);
  if (storedGoogleImage) return normalizePhotoUrlForPublic(storedGoogleImage);

  return null;
}

export function extractPhotoValues(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value))
    return value.flatMap((item) => extractPhotoValues(item));

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      record.url,
      record.photo_url,
      record.image_url,
      record.src,
      record.cached_photo_url,
      record.google_photo_url,
    ].flatMap((item) => extractPhotoValues(item));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        return extractPhotoValues(JSON.parse(trimmed));
      } catch {
        // Not JSON; continue with the raw string below.
      }
    }
    return [trimmed];
  }

  return [];
}

export function normalizePhotoUrl(value: unknown) {
  const raw = String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!raw) return "";
  if (/^(null|undefined|n\/a|na|none|false)$/i.test(raw)) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (/^http:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, "https://");
  return raw;
}

export function isLikelyValidImageUrl(value: unknown) {
  const url = normalizePhotoUrl(value);
  if (!url) return false;
  if (/\s/.test(url)) return false;
  if (/^(data|blob|javascript):/i.test(url)) return false;
  if (url.startsWith("/")) return !url.startsWith("//") && url.length > 1;
  if (!/^https:\/\//i.test(url)) return false;

  try {
    const parsed = new URL(url);
    return Boolean(parsed.hostname) && parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

export function getPhotoDedupeKey(value: unknown) {
  const url = normalizePhotoUrl(value);
  if (!url) return "";

  try {
    const parsed = new URL(url, "https://theouthaven.local");
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
    const ref =
      parsed.searchParams.get("photo_reference") ||
      parsed.searchParams.get("photoreference") ||
      parsed.searchParams.get("ref");

    if (
      ref &&
      (host === "maps.googleapis.com" ||
        path.includes("/api/public/google-place-photo"))
    )
      return `google-ref:${ref.trim()}`;

    const placeId =
      parsed.searchParams.get("placeId") || parsed.searchParams.get("place_id");
    if (placeId && path.includes("/api/public/google-place-photo"))
      return `google-place:${placeId.trim()}`;

    parsed.protocol = "https:";
    parsed.hash = "";
    parsed.searchParams.delete("key");
    parsed.searchParams.delete("maxwidth");
    parsed.searchParams.delete("maxheight");
    parsed.searchParams.delete("width");
    parsed.searchParams.delete("height");

    return parsed
      .toString()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  } catch {
    return url
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}

function photoRecordDedupeKeys(value: unknown, normalizedUrl: string) {
  const keys = new Set<string>();
  const urlKey = getPhotoDedupeKey(normalizedUrl);
  if (urlKey) keys.add(`url:${urlKey}`);

  if (!value || typeof value !== "object") return keys;

  const record = value as Record<string, unknown>;
  const add = (prefix: string, raw: unknown) => {
    const normalized = String(raw || "").trim().toLowerCase();
    if (normalized) keys.add(`${prefix}:${normalized}`);
  };

  add("id", record.id);
  add("path", record.storage_path ?? record.path ?? record.objectPath);
  add(
    "google-ref",
    record.google_photo_reference ??
      record.google_photo_ref ??
      record.photo_reference ??
      record.photoReference,
  );

  return keys;
}

export function dedupeLocationPhotos(values: unknown[]) {
  const seen = new Set<string>();
  return values
    .map(normalizePhotoUrl)
    .filter(isLikelyValidImageUrl)
    .filter((url) => {
      const key = getPhotoDedupeKey(url);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export const dedupePhotoUrls = dedupeLocationPhotos;

export function normalizeLocationPhotoList(input: unknown): PublicLocationPhoto[] {
  const values =
    typeof input === "string"
      ? extractPhotoValues(input)
      : Array.isArray(input)
        ? input
        : input == null
          ? []
          : [input];

  const seen = new Set<string>();
  const photos: PublicLocationPhoto[] = [];

  for (const value of values) {
    const rawUrl = normalizePhotoUrlForPublic(value);
    const url = normalizePhotoUrl(rawUrl);
    if (!isLikelyValidImageUrl(url)) continue;

    const keys = photoRecordDedupeKeys(value, url);
    if ([...keys].some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));

    const record =
      value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const source = String(record.source ?? record.photo_source ?? "").trim();
    const alt = String(record.alt ?? record.alt_text ?? record.caption ?? "").trim();
    const id = String(record.id ?? "").trim();
    const sortOrder = Number(record.sort_order ?? record.sortOrder);

    photos.push({
      ...(id ? { id } : {}),
      url,
      ...(alt ? { alt } : {}),
      ...(source ? { source } : {}),
      ...(typeof record.isPrimary === "boolean"
        ? { isPrimary: record.isPrimary }
        : typeof record.is_primary === "boolean"
          ? { isPrimary: record.is_primary }
          : {}),
      ...(Number.isFinite(sortOrder) ? { sortOrder } : {}),
    });
  }

  return photos.sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

export function normalizePublicLocationPhotosFromRecord(
  location: PublicLocationPhotoRecord | null,
) {
  if (!location) return [];

  return dedupeLocationPhotos([
    getBestPublicLocationImageFromRecord(location),
    location.main_image,
    location.image_url,
    location.cover_image,
    location.hero_image,
    location.hero_image_url,
    location.thumbnail_url,
    location.photo_url,
    location.primary_photo_url,
    location.place_photo_url,
    location.cached_photo_url,
    location.google_photo_url,
    location.google_image_url,
    location.yelp_image_url,
    ...extractPhotoValues(location.images),
    ...extractPhotoValues(location.photos),
    ...extractPhotoValues(location.photo_urls),
    ...extractPhotoValues(location.gallery_images),
    ...extractPhotoValues(location.image_urls),
    ...extractPhotoValues(location.main_images),
    ...extractPhotoValues(location.google_photos),
    ...extractPhotoValues(location.google_photo_urls),
    ...extractPhotoValues(location.cached_photo_urls),
  ]).slice(0, 5);
}

export function getBestLocationImage(record: unknown): string | null {
  return getBestPublicLocationImageFromRecord(
    (record || null) as Record<string, unknown> | null,
  );
}

export function getPublicLocationPhotosFromRecord(record: unknown) {
  return normalizePublicLocationPhotosFromRecord(
    (record || null) as PublicLocationPhotoRecord | null,
  );
}

export function getMissingPhotoStatusFromRecord(record: unknown) {
  const photos = normalizePublicLocationPhotosFromRecord(
    (record || null) as PublicLocationPhotoRecord | null,
  );
  const bestImage = getBestPublicLocationImageFromRecord(
    (record || null) as Record<string, unknown> | null,
  );

  return {
    hasPublicPhoto: Boolean(bestImage || photos.length > 0),
    bestImage,
    photos,
    count: photos.length,
  };
}

export const getPhotoList = normalizePublicLocationPhotosFromRecord;

export function getPrimaryPhoto(location: PublicLocationPhotoRecord | null) {
  return normalizePublicLocationPhotosFromRecord(location)[0] || "";
}

export function normalizePublicCardImageRecord<T extends Record<string, any>>(
  item: T,
): T {
  const rawImage =
    firstPhoto(item?.images) ||
    firstPhoto(item?.main_image) ||
    firstPhoto(item?.image_url) ||
    firstPhoto(item?.photos) ||
    firstPhoto(item?.gallery_images) ||
    firstPhoto(item?.gallery) ||
    firstPhoto(item?.image_gallery) ||
    firstPhoto(item?.google_photo_url) ||
    firstPhoto(item?.primary_photo_url) ||
    firstPhoto(item?.image);

  const image =
    getBestPublicLocationImageFromRecord(item) ||
    normalizePhotoUrlForPublic(rawImage);

  const uniqueImages = Array.from(
    new Set(
      [
        image,
        ...normalizePublicLocationPhotosFromRecord(item),
        ...extractPhotoValues(item?.images),
        ...extractPhotoValues(item?.gallery_images),
      ].filter((url): url is string => Boolean(url)),
    ),
  );
  const galleryImages = uniqueImages.filter((url) => url !== image);

  return {
    ...item,
    image_url: image || null,
    main_image: image || null,
    images: uniqueImages.length ? uniqueImages : Array.isArray(item?.images) ? item.images : [],
    gallery_images: galleryImages,
    has_photos: Boolean(image),
    photo_status: image ? item?.photo_status || "has_photo" : "missing_photo",
  };
}

export function hasPublicCardImage(item: unknown) {
  return Boolean(
    getBestPublicLocationImageFromRecord(
      normalizePublicCardImageRecord((item || {}) as Record<string, unknown>),
    ),
  );
}
