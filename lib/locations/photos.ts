import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CacheGooglePhotoOptions, LocationLike, LocationPhoto, MissingPhotoStatus, PublicLocationPhoto } from "@/lib/locations/photoTypes";
import { getPhotoDedupeKey, isLikelyValidImageUrl, normalizePhotoUrl } from "@/lib/locations/photoValidation";

const FALLBACK_IMAGE = "/toh_logo.png";

function extractPhotoValues(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(extractPhotoValues);
  if (typeof value === "object") {
    const r = value as Record<string, unknown>;
    return [r.url, r.photo_url, r.image_url, r.src, r.publicUrl, r.public_url, r.cached_photo_url, r.google_photo_url].flatMap(extractPhotoValues);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
      try { return extractPhotoValues(JSON.parse(trimmed)); } catch {}
    }
    return trimmed.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function displayName(location: LocationLike | null | undefined) {
  return String(location?.name || location?.restaurant_name || location?.activity_name || "Location photo").trim();
}

function sourceFor(url: string): LocationPhoto["source"] {
  if (url.includes("/storage/v1/object/public/location-images/")) return "upload";
  if (url.includes("/api/public/google-place-photo")) return "google";
  if (url.includes("maps.googleapis.com/maps/api/place/photo")) return "google";
  return "external";
}

function toPublicGoogleUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "maps.googleapis.com" && parsed.pathname.includes("/maps/api/place/photo")) {
      const ref = parsed.searchParams.get("photo_reference") || parsed.searchParams.get("photoreference") || parsed.searchParams.get("ref");
      const maxwidth = parsed.searchParams.get("maxwidth") || "1200";
      if (ref) return `/api/public/google-place-photo?ref=${encodeURIComponent(ref)}&maxwidth=${encodeURIComponent(maxwidth)}`;
    }
  } catch {}
  return url;
}

export function normalizeLocationPhotoList(input: unknown, location?: LocationLike | null): LocationPhoto[] {
  const values = extractPhotoValues(input);
  return values.map((value, index) => {
    const url = toPublicGoogleUrl(normalizePhotoUrl(value));
    return { url, alt: displayName(location), source: sourceFor(url), sortOrder: index, public: true, approved: true } satisfies LocationPhoto;
  }).filter((photo) => isLikelyValidImageUrl(photo.url));
}

export function dedupeLocationPhotos(photos: LocationPhoto[]): LocationPhoto[] {
  const seen = new Set<string>();
  return photos.filter((photo) => {
    const url = toPublicGoogleUrl(normalizePhotoUrl(photo.url));
    if (!isLikelyValidImageUrl(url)) return false;
    const key = getPhotoDedupeKey(url, { storagePath: photo.storagePath, googlePhotoReference: photo.googlePhotoReference });
    if (!key || seen.has(key)) return false;
    seen.add(key);
    photo.url = url;
    photo.dedupeKey = key;
    return true;
  });
}

export function getPublicLocationPhotosFromRecord(location: LocationLike | null | undefined): PublicLocationPhoto[] {
  if (!location) return [];
  const candidates: LocationPhoto[] = [];
  const primaryValues = [location.main_image, location.image_url, (location as any).primary_photo_url, (location as any).photo_url, (location as any).cached_photo_url, (location as any).google_photo_url];
  for (const [index, value] of primaryValues.entries()) {
    candidates.push(...normalizeLocationPhotoList(value, location).map((p) => ({ ...p, isPrimary: index < 2 })));
  }
  const galleryFields = ["images", "photos", "photo_urls", "gallery_images", "image_urls", "image_gallery", "gallery", "google_photos", "google_photo_urls", "cached_photo_urls"];
  for (const field of galleryFields) candidates.push(...normalizeLocationPhotoList((location as any)[field], location));
  return dedupeLocationPhotos(candidates).map((photo, index) => ({ ...photo, isPrimary: index === 0 || photo.isPrimary, sortOrder: index }));
}

export function getBestLocationImage(location: LocationLike | null | undefined, options?: { includeFallback?: boolean }) {
  const photo = getPublicLocationPhotosFromRecord(location)[0];
  if (photo?.url) return photo.url;
  if (options?.includeFallback) return FALLBACK_IMAGE;
  return null;
}

export function getLocationPhotoGallery(location: LocationLike | null | undefined, options?: { excludeHero?: boolean }) {
  const photos = getPublicLocationPhotosFromRecord(location);
  return options?.excludeHero ? photos.slice(1) : photos;
}

export function getMissingPhotoStatusFromRecord(location: LocationLike | null | undefined): MissingPhotoStatus {
  const photos = getPublicLocationPhotosFromRecord(location);
  return { locationId: String(location?.id || "") || null, hasPublicPhoto: photos.length > 0, status: photos.length ? "has_photo" : "missing_photo", primaryPhotoUrl: photos[0]?.url || null, photoCount: photos.length };
}

export async function getPublicLocationPhotos(locationIdOrSlug: string) {
  const { data, error } = await supabaseAdmin.from("locations").select("*").or(`id.eq.${locationIdOrSlug},slug.eq.${locationIdOrSlug}`).maybeSingle();
  if (error) throw error;
  return getPublicLocationPhotosFromRecord(data as any);
}

export async function getLocationPhotos(locationId: string) {
  const { data, error } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle();
  if (error) throw error;
  return getPublicLocationPhotosFromRecord(data as any);
}

export async function getEditableLocationPhotos(locationId: string, _context: unknown) { return getLocationPhotos(locationId); }
export async function uploadLocationPhoto(): Promise<never> { throw new Error("Use the canonical upload API route for file uploads."); }
export async function setPrimaryLocationPhoto(): Promise<never> { throw new Error("Not implemented for legacy array-backed photos."); }
export async function deleteLocationPhoto(): Promise<never> { throw new Error("Not implemented for legacy array-backed photos."); }
export async function cacheGoogleLocationPhoto(_locationId: string, _options?: CacheGooglePhotoOptions) { throw new Error("Use cacheGooglePlacePhotoToStorage wrapper."); }
export async function repairLocationPhotoPublishability(locationId: string) { const { getPhotoPublishabilityUpdates } = await import("@/lib/location-growth/repairPhotoPublishability"); const { data, error } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle(); if (error) throw error; return getPhotoPublishabilityUpdates(data as any); }
export async function getMissingPhotoStatus(locationId: string) { const { data, error } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle(); if (error) throw error; return getMissingPhotoStatusFromRecord(data as any); }
