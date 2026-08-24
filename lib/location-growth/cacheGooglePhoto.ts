import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  fetchPlacePhotoNew,
  getPlacePhotoNameNew,
} from "@/lib/google/places-new-client";

const BUCKET = "location-images";
const STORAGE_FILE_LIMIT_BYTES = 10 * 1024 * 1024;
const SUPPORTED_STORAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const GOOGLE_MAX_ATTEMPTS = 4;

function clean(value: unknown) {
  return String(value || "").trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extensionFromContentType(contentType: string) {
  const normalized = contentType.toLowerCase();

  if (normalized.includes("image/png")) return "png";
  if (normalized.includes("image/webp")) return "webp";
  if (normalized.includes("image/gif")) return "gif";

  return "jpg";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after") || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 10_000);
  }
  return Math.min(750 * 2 ** attempt + Math.floor(Math.random() * 250), 8_000);
}

async function fetchGooglePhotoBytes(photoName: string, maxWidthPx = 1200) {
  let response: Response | null = null;

  for (let attempt = 0; attempt < GOOGLE_MAX_ATTEMPTS; attempt += 1) {
    response = await fetchPlacePhotoNew(photoName, {
      maxWidthPx,
      cache: "no-store",
    });

    if (response.status !== 429) break;
    if (attempt < GOOGLE_MAX_ATTEMPTS - 1) {
      await sleep(retryDelayMs(response, attempt));
    }
  }

  if (!response) {
    throw new Error("Google Places photo request did not return a response.");
  }

  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!response.ok || !contentType.startsWith("image/")) {
    const text = await response.text().catch(() => "");

    throw new Error(
      `Google Places photo request failed: ${response.status} ${response.statusText} ${contentType} ${text.slice(
        0,
        300,
      )}`,
    );
  }

  if (!SUPPORTED_STORAGE_MIME_TYPES.has(contentType)) {
    throw new Error(`Google returned unsupported image type ${contentType || "unknown"}.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length < 1000) {
    throw new Error("Google photo response was too small to be a valid image.");
  }

  if (buffer.length > STORAGE_FILE_LIMIT_BYTES) {
    throw new Error(
      `Google photo is too large for Supabase Storage (${buffer.length} bytes > ${STORAGE_FILE_LIMIT_BYTES}).`,
    );
  }

  return {
    buffer,
    contentType,
    extension: extensionFromContentType(contentType),
  };
}

export async function cacheGooglePlacePhotoToStorage(location: {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  google_place_id?: string | null;
}) {
  if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY.");
  }

  const placeId = clean(location.google_place_id);

  if (!placeId) {
    throw new Error("Location has no google_place_id.");
  }

  const displayName =
    clean(location.name) ||
    clean(location.restaurant_name) ||
    clean(location.activity_name) ||
    "location";

  const photoName = await getPlacePhotoNameNew(placeId);
  const photo = await fetchGooglePhotoBytes(photoName);

  const safeName = slugify(displayName) || "location";
  const objectPath = `${location.id}/${safeName}-${Date.now()}.${photo.extension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(objectPath, photo.buffer, {
      contentType: photo.contentType,
      cacheControl: "31536000",
      upsert: true,
    });

  if (uploadError) {
    const storageError = uploadError as typeof uploadError & {
      statusCode?: string | number;
      error?: string;
    };
    const status = storageError.statusCode ? ` ${storageError.statusCode}` : "";
    const code = storageError.error ? ` ${storageError.error}` : "";
    throw new Error(
      `Supabase Storage upload failed${status}${code}: ${storageError.message} ` +
        `(type=${photo.contentType}, bytes=${photo.buffer.length}, path=${objectPath})`,
    );
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath);

  const publicUrl = data.publicUrl;

  if (!publicUrl) {
    throw new Error("Supabase Storage did not return a public URL.");
  }

  return {
    publicUrl,
    objectPath,
    contentType: photo.contentType,
    bytes: photo.buffer.length,
    // Preserve the historical response property for callers, but it now
    // contains a Places API (New) photo resource name rather than a legacy ref.
    photoReference: photoName,
  };
}
