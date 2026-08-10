import { supabaseAdmin } from "@/lib/supabase-admin";

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

async function fetchGoogleWithRetry(url: string, init: RequestInit, label: string) {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < GOOGLE_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, init);
    lastResponse = response;

    if (response.status !== 429) return response;

    if (attempt < GOOGLE_MAX_ATTEMPTS - 1) {
      await sleep(retryDelayMs(response, attempt));
    }
  }

  if (!lastResponse) throw new Error(`${label} request did not return a response.`);
  return lastResponse;
}

async function fetchFreshPhotoReference(placeId: string, key: string) {
  const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  detailsUrl.searchParams.set("place_id", placeId);
  detailsUrl.searchParams.set("fields", "photos");
  detailsUrl.searchParams.set("key", key);

  const response = await fetchGoogleWithRetry(
    detailsUrl.toString(),
    { cache: "no-store" },
    "Google Place Details",
  );

  const json = await response.json().catch(() => null);

  if (!response.ok || json?.status !== "OK") {
    throw new Error(
      json?.error_message ||
        `Google Place Details failed with status ${json?.status || response.status}`,
    );
  }

  const photoReference = clean(json?.result?.photos?.[0]?.photo_reference);

  if (!photoReference) {
    throw new Error("Google Place Details returned no photo_reference.");
  }

  return photoReference;
}

async function fetchGooglePhotoBytes(photoReference: string, key: string, maxwidth = "1200") {
  const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
  photoUrl.searchParams.set("maxwidth", maxwidth);
  photoUrl.searchParams.set("photo_reference", photoReference);
  photoUrl.searchParams.set("key", key);

  const response = await fetchGoogleWithRetry(
    photoUrl.toString(),
    {
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": "TheOutHaven/1.0",
        Accept: "image/jpeg,image/webp,image/png;q=0.9,image/gif;q=0.8",
      },
    },
    "Google photo",
  );

  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!response.ok || !contentType.startsWith("image/")) {
    const text = await response.text().catch(() => "");

    throw new Error(
      `Google photo request failed: ${response.status} ${response.statusText} ${contentType} ${text.slice(
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
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;

  if (!key) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY or GOOGLE_API_KEY.");
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

  const photoReference = await fetchFreshPhotoReference(placeId, key);
  const photo = await fetchGooglePhotoBytes(photoReference, key);

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
    photoReference,
  };
}
