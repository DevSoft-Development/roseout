import { getLocationImage } from "@/lib/locationImage";

export type PublicLocationPhotoRecord = Record<string, unknown> & {
  main_image?: string | null;
  image_url?: string | null;
};

export function extractPhotoValues(value: unknown): unknown[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractPhotoValues(item));
  }

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

    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
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
  const raw = String(value || "").trim().replace(/^["']|["']$/g, "");

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
    ) {
      return `google-ref:${ref.trim()}`;
    }

    const placeId = parsed.searchParams.get("placeId") || parsed.searchParams.get("place_id");
    if (placeId && path.includes("/api/public/google-place-photo")) {
      return `google-place:${placeId.trim()}`;
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

export function dedupePhotoUrls(values: unknown[]) {
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

export function getPhotoList(location: PublicLocationPhotoRecord | null) {
  if (!location) return [];

  return dedupePhotoUrls([
    getLocationImage(location),
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

export function getPrimaryPhoto(location: PublicLocationPhotoRecord | null) {
  return getPhotoList(location)[0] || "";
}
