import type { PublicLocationCard } from "./responseTypes";

const GOOGLE_PHOTO_HOST = "maps.googleapis.com";

export function sanitizePublicImageUrl(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    if (url.hostname !== GOOGLE_PHOTO_HOST || !url.pathname.includes("/maps/api/place/photo")) return value;
    const ref = url.searchParams.get("photo_reference");
    if (!ref) return null;
    return `/api/public/google-place-photo?ref=${encodeURIComponent(ref)}`;
  } catch {
    return value.replace(/([?&])key=AIza[0-9A-Za-z_-]+/g, "$1").replace(/[?&]$/, "");
  }
}

function sanitizeImageArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(sanitizePublicImageUrl).filter((item): item is string => typeof item === "string" && item.length > 0)
    : value;
}

export function sanitizePublicLocation<T extends PublicLocationCard>(location: T): T {
  return {
    ...location,
    image_url: sanitizePublicImageUrl(location.image_url) as string | null,
    main_image: sanitizePublicImageUrl(location.main_image) as string | null,
    images: sanitizeImageArray(location.images),
    gallery_images: sanitizeImageArray(location.gallery_images),
  } as T;
}
