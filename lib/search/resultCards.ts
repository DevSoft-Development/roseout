import { getLocationImage } from "@/lib/locationImage";
import { normalizePublicCardImage } from "@/lib/publicCardImage";
import {
  getBestPublicLocationImageFromRecord,
  normalizeLocationPhotoList,
  normalizePublicLocationPhotosFromRecord,
  normalizePhotoUrlForPublic,
} from "@/lib/locations/photo-public";

function normalizeCardTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.flatMap((item): string[] => {
    if (!item) return [];
    if (Array.isArray(item)) return normalizeCardTags(item);
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed || ["[]", "{}", "null", "undefined"].includes(trimmed.toLowerCase())) return [];
      if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
        try { return normalizeCardTags(JSON.parse(trimmed)); } catch { return []; }
      }
      return trimmed.split(",").map((part) => part.trim()).filter(Boolean);
    }
    return [String(item).trim()].filter(Boolean);
  }).map((label) => label.replace(/_/g, " ").replace(/-/g, " ").trim()).filter(Boolean))).slice(0, 8);
}

function sanitizePhotoUrls(values: unknown[]): string[] {
  return Array.from(new Set(
    normalizeLocationPhotoList(values)
      .map((photo) => normalizePhotoUrlForPublic(photo.url))
      .filter((url): url is string => Boolean(url)),
  ));
}

export function shapePublicSearchCard(item: any) {
  const normalizedPublicPhotos = normalizePublicLocationPhotosFromRecord(item).filter(Boolean);
  const rawPhotos = [
    ...normalizedPublicPhotos,
    ...(Array.isArray(item?.images) ? item.images : []),
    ...(Array.isArray(item?.gallery_images) ? item.gallery_images : []),
  ];
  const bestPublicImage = getBestPublicLocationImageFromRecord(item);
  const fallbackImage = normalizePhotoUrlForPublic(getLocationImage(item));
  const usableImage = bestPublicImage || fallbackImage || "/toh_logo.png";
  const images = Array.from(new Set([usableImage, ...sanitizePhotoUrls(rawPhotos)].filter(Boolean)));
  const galleryImages = images.filter((url) => url !== usableImage);

  return normalizePublicCardImage({
    id: item?.id ?? item?.source_id ?? item?.google_place_id ?? null,
    name: item?.name ?? item?.restaurant_name ?? item?.activity_name ?? item?.business_name ?? "Unknown location",
    location_type: item?.location_type ?? (item?.restaurant_name ? "restaurant" : item?.activity_name ? "activity" : null),
    primary_category: item?.primary_category ?? item?.category ?? null,
    cuisine: item?.cuisine ?? item?.cuisine_type ?? null,
    activity_type: item?.activity_type ?? null,
    address: item?.address ?? null,
    city: item?.city ?? null,
    state: item?.state ?? null,
    borough: item?.borough ?? null,
    neighborhood: item?.neighborhood ?? null,
    google_place_id: item?.google_place_id ?? null,
    image_url: normalizePhotoUrlForPublic(usableImage) ?? "/toh_logo.png",
    main_image: normalizePhotoUrlForPublic(usableImage) ?? "/toh_logo.png",
    images,
    gallery_images: galleryImages,
    has_photos: item?.has_photos ?? Boolean(usableImage),
    photo_status: item?.photo_status ?? null,
    rating: item?.rating ?? null,
    price_level: item?.price_level ?? item?.price_range ?? null,
    phone_number: item?.phone_number ?? item?.phone ?? null,
    reservation_url: item?.reservation_url ?? item?.reservation_link ?? item?.booking_url ?? null,
    external_reservation_url: item?.external_reservation_url ?? null,
    tags: normalizeCardTags([item?.tags, item?.vibe_tags, item?.best_for_tags, item?.intent_tags]),
    distance: item?.pair_distance_miles ?? item?.distance_miles ?? null,
    source_table: item?.source_table ?? null,
    detail_location_type: item?.detail_location_type ?? null,
    website: item?.website ?? null,
  });
}
