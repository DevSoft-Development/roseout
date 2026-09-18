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

function clean(value: unknown) {
  return String(value || "").trim();
}

function isBadImageValue(value: unknown) {
  const normalized = clean(value).toLowerCase();
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
  if (isBadImageValue(trimmed) || trimmed.length <= 8) return false;
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("data:image/");
}

function isSupabaseStorageImage(value: string) {
  return value.includes("/storage/v1/object/public/location-images/");
}

function parsedUrl(value: string) {
  try {
    return new URL(value, "https://theouthaven.local");
  } catch {
    return null;
  }
}

function isGooglePlacesPhotoUrl(value: string) {
  const parsed = parsedUrl(value);
  if (!parsed) return false;
  return (
    (parsed.hostname === "maps.googleapis.com" && parsed.pathname.includes("/maps/api/place/photo")) ||
    parsed.pathname.includes("/api/public/google-place-photo")
  );
}

function extractGooglePhotoReference(value: string) {
  const parsed = parsedUrl(value);
  if (!parsed) return null;
  if (
    (parsed.hostname === "maps.googleapis.com" && parsed.pathname.includes("/maps/api/place/photo")) ||
    parsed.pathname.includes("/api/public/google-place-photo")
  ) {
    return (
      parsed.searchParams.get("photo_reference") ||
      parsed.searchParams.get("photoreference") ||
      parsed.searchParams.get("ref")
    );
  }
  return null;
}

function extractGooglePhotoMaxwidth(value: string) {
  const parsed = parsedUrl(value);
  return parsed?.searchParams.get("maxwidth") || "1200";
}

function googlePlaceId(location: Record<string, unknown> | null | undefined) {
  const value = clean(location?.google_place_id);
  return value || null;
}

export function googlePhotoSlotUrl(placeId: string, index = 0, maxwidth = 1200) {
  const id = clean(placeId);
  if (!id) return null;
  const slot = Math.max(0, Math.min(9, Math.floor(Number(index) || 0)));
  const width = Math.max(1, Math.min(4800, Math.floor(Number(maxwidth) || 1200)));
  return `/api/public/google-place-photo?placeId=${encodeURIComponent(id)}&index=${slot}&maxwidth=${width}`;
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
        // Treat malformed JSON-looking strings as plain values below.
      }
    }
    const directValue = trimmed.split(/[\n,]+/).find((item) => isUsableImageUrl(item.trim()));
    return directValue?.trim() || null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      firstPhoto(record.url) ||
      firstPhoto(record.src) ||
      firstPhoto(record.owner_primary_photo_url) ||
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

export function extractPhotoValues(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => extractPhotoValues(item));

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      record.url,
      record.photo_url,
      record.image_url,
      record.src,
      record.cached_photo_url,
      record.google_photo_url,
      record.owner_primary_photo_url,
      record.owner_photo_urls,
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
        // Not JSON; keep the raw value.
      }
    }
    return [trimmed];
  }
  return [];
}

function collectOwnerImageCandidates(location: Record<string, unknown> | null | undefined) {
  if (!location) return [] as string[];
  return dedupeLocationPhotos([
    location.owner_primary_photo_url,
    ...extractPhotoValues(location.owner_photo_urls),
  ]);
}

function collectLocationImageCandidates(location: Record<string, unknown> | null | undefined) {
  if (!location) return [] as string[];
  return [
    ...collectOwnerImageCandidates(location),
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

  const ownerPhotos = collectOwnerImageCandidates(location);
  if (ownerPhotos[0]) return normalizePhotoUrlForPublic(ownerPhotos[0]);

  const candidates = collectLocationImageCandidates(location);
  const storageImage = candidates.find((image) => isSupabaseStorageImage(image) && !isGooglePlacesPhotoUrl(image));
  if (storageImage) return normalizePhotoUrlForPublic(storageImage);

  const stableNonGoogleImage = candidates.find((image) => !isGooglePlacesPhotoUrl(image));
  if (stableNonGoogleImage) return normalizePhotoUrlForPublic(stableNonGoogleImage);

  const placeId = googlePlaceId(location);
  if (placeId) return googlePhotoSlotUrl(placeId, 0, 1200);

  const storedGoogleImage = candidates.find(isGooglePlacesPhotoUrl);
  if (storedGoogleImage) return normalizePhotoUrlForPublic(storedGoogleImage);
  return null;
}

export function normalizePhotoUrl(value: unknown) {
  const raw = clean(value).replace(/^["']|["']$/g, "");
  if (!raw) return "";
  if (/^(null|undefined|n\/a|na|none|false)$/i.test(raw)) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (/^http:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, "https://");
  return raw;
}

export function isLikelyValidImageUrl(value: unknown) {
  const url = normalizePhotoUrl(value);
  if (!url || /\s/.test(url) || /^(data|blob|javascript):/i.test(url)) return false;
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
      (host === "maps.googleapis.com" || path.includes("/api/public/google-place-photo"))
    ) {
      return `google-ref:${ref.trim()}`;
    }

    const placeId = parsed.searchParams.get("placeId") || parsed.searchParams.get("place_id");
    if (placeId && path.includes("/api/public/google-place-photo")) {
      const index = Math.max(0, Math.floor(Number(parsed.searchParams.get("index")) || 0));
      return `google-place:${placeId.trim()}:slot:${index}`;
    }

    parsed.protocol = "https:";
    parsed.hash = "";
    parsed.searchParams.delete("key");
    parsed.searchParams.delete("maxwidth");
    parsed.searchParams.delete("maxheight");
    parsed.searchParams.delete("width");
    parsed.searchParams.delete("height");
    return parsed.toString().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  }
}

function photoRecordDedupeKeys(value: unknown, normalizedUrl: string) {
  const keys = new Set<string>();
  const urlKey = getPhotoDedupeKey(normalizedUrl);
  if (urlKey) keys.add(`url:${urlKey}`);
  if (!value || typeof value !== "object") return keys;

  const record = value as Record<string, unknown>;
  const add = (prefix: string, raw: unknown) => {
    const normalized = clean(raw).toLowerCase();
    if (normalized) keys.add(`${prefix}:${normalized}`);
  };
  add("id", record.id);
  add("path", record.storage_path ?? record.path ?? record.objectPath);
  add(
    "google-ref",
    record.google_photo_reference ?? record.google_photo_ref ?? record.photo_reference ?? record.photoReference,
  );
  return keys;
}

export function dedupeLocationPhotos(values: unknown[]) {
  const seen = new Set<string>();
  return values
    .flatMap((value) => extractPhotoValues(value))
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
  const values = typeof input === "string"
    ? extractPhotoValues(input)
    : Array.isArray(input)
      ? input.flatMap((item) => extractPhotoValues(item))
      : input == null
        ? []
        : extractPhotoValues(input);

  const seen = new Set<string>();
  const photos: PublicLocationPhoto[] = [];
  for (const value of values) {
    const rawUrl = normalizePhotoUrlForPublic(value);
    const url = normalizePhotoUrl(rawUrl);
    if (!isLikelyValidImageUrl(url)) continue;

    const keys = photoRecordDedupeKeys(value, url);
    if ([...keys].some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));

    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const source = clean(record.source ?? record.photo_source);
    const alt = clean(record.alt ?? record.alt_text ?? record.caption);
    const id = clean(record.id);
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

  const ownerPhotos = collectOwnerImageCandidates(location);
  const existing = dedupeLocationPhotos([
    ...ownerPhotos,
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
  ]);

  const placeId = googlePlaceId(location);
  if (!placeId || existing.length >= 5) return existing.slice(0, 5);

  const startIndex = existing.length > 0 ? existing.length : 0;
  const googleSlots = Array.from({ length: Math.max(0, 5 - startIndex) }, (_, offset) =>
    googlePhotoSlotUrl(placeId, startIndex + offset, 1200),
  ).filter((value): value is string => Boolean(value));

  // Existing/stored photos stay first. Google fills only missing positions. Slot 0
  // is the primary fallback; slots 1-4 are availability-checked and lazy-loaded by
  // SafeLocationImage, so new imports pay for one photo until gallery demand exists.
  return dedupeLocationPhotos([...existing, ...googleSlots]).slice(0, 5);
}

export function getLazyGooglePhotoSlots(
  location: PublicLocationPhotoRecord | null,
  maxPhotos = 5,
  startIndex = 1,
) {
  const placeId = googlePlaceId(location);
  if (!placeId) return [];
  const limit = Math.max(1, Math.min(5, Math.floor(Number(maxPhotos) || 5)));
  const start = Math.max(1, Math.min(5, Math.floor(Number(startIndex) || 1)));
  // Slot zero is reserved for the primary image. Existing photos consume the first
  // positions, so only the missing Google slots are considered for lazy loading.
  return Array.from({ length: Math.max(0, limit - start) }, (_, offset) =>
    googlePhotoSlotUrl(placeId, start + offset, 1200),
  ).filter((value): value is string => Boolean(value));
}

export function getBestLocationImage(record: unknown): string | null {
  return getBestPublicLocationImageFromRecord((record || null) as Record<string, unknown> | null);
}

export function getPublicLocationPhotosFromRecord(record: unknown) {
  return normalizePublicLocationPhotosFromRecord((record || null) as PublicLocationPhotoRecord | null);
}

export function getMissingPhotoStatusFromRecord(record: unknown) {
  const photos = normalizePublicLocationPhotosFromRecord((record || null) as PublicLocationPhotoRecord | null);
  const bestImage = getBestPublicLocationImageFromRecord((record || null) as Record<string, unknown> | null);
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

export function normalizePublicCardImageRecord<T extends Record<string, any>>(item: T): T {
  const rawImage =
    firstPhoto(item?.owner_primary_photo_url) ||
    firstPhoto(item?.owner_photo_urls) ||
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

  const image = getBestPublicLocationImageFromRecord(item) || normalizePhotoUrlForPublic(rawImage);
  const uniqueImages = dedupeLocationPhotos([
    image,
    ...normalizePublicLocationPhotosFromRecord(item),
    ...extractPhotoValues(item?.images),
    ...extractPhotoValues(item?.gallery_images),
  ]);
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
