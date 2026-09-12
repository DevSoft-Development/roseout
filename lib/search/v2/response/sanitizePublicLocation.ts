import type { PublicLocationCard } from "./responseTypes";

const GOOGLE_PHOTO_HOST = "maps.googleapis.com";
const PUBLIC_TAXONOMY_FIELDS = [
  "primary_category",
  "primary_tag",
  "cuisine",
  "cuisine_type",
  "food_type",
  "activity_type",
] as const;

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

export function humanizePublicTaxonomyLabel(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return value;
  return normalized
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bNyc\b/g, "NYC")
    .replace(/\bBbq\b/g, "BBQ")
    .replace(/\bR&b\b/gi, "R&B");
}

function humanizePublicTaxonomyFields<T extends PublicLocationCard>(location: T) {
  const next = { ...location } as Record<string, unknown>;
  for (const field of PUBLIC_TAXONOMY_FIELDS) {
    if (field in next) next[field] = humanizePublicTaxonomyLabel(next[field]);
  }
  return next as T;
}

export function sanitizePublicLocation<T extends PublicLocationCard>(location: T): T {
  const humanized = humanizePublicTaxonomyFields(location);
  return {
    ...humanized,
    image_url: sanitizePublicImageUrl(humanized.image_url) as string | null,
    main_image: sanitizePublicImageUrl(humanized.main_image) as string | null,
    images: sanitizeImageArray(humanized.images),
    gallery_images: sanitizeImageArray(humanized.gallery_images),
  } as T;
}
