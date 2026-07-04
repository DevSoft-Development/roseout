import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPublicLocationPhotosFromRecord } from "@/lib/locations/photos";

const BUCKET = "location-images";

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
  if (normalized.includes("image/avif")) return "avif";

  return "jpg";
}

async function fetchFreshPhotoReference(placeId: string, key: string) {
  const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  detailsUrl.searchParams.set("place_id", placeId);
  detailsUrl.searchParams.set("fields", "photos");
  detailsUrl.searchParams.set("key", key);

  const response = await fetch(detailsUrl.toString(), {
    cache: "no-store",
  });

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

async function fetchGooglePhotoBytes(photoReference: string, key: string, maxwidth = "1600") {
  const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
  photoUrl.searchParams.set("maxwidth", maxwidth);
  photoUrl.searchParams.set("photo_reference", photoReference);
  photoUrl.searchParams.set("key", key);

  const response = await fetch(photoUrl.toString(), {
    redirect: "follow",
    cache: "no-store",
    headers: {
      "User-Agent": "TheOutHaven/1.0",
    },
  });

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok || !contentType.startsWith("image/")) {
    const text = await response.text().catch(() => "");

    throw new Error(
      `Google photo request failed: ${response.status} ${response.statusText} ${contentType} ${text.slice(
        0,
        300,
      )}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length < 1000) {
    throw new Error("Google photo response was too small to be a valid image.");
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

  const existingPhotos = getPublicLocationPhotosFromRecord(location as any);
  const existingGoogle = existingPhotos.find((photo) => photo.source === "google" || photo.source === "cached_google");
  if (existingGoogle?.url) {
    return {
      publicUrl: existingGoogle.url,
      objectPath: null,
      contentType: "",
      bytes: 0,
      photoReference: "existing",
      skipped: "duplicate_existing_google_photo",
    };
  }

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
    throw new Error(`Supabase Storage upload failed: ${uploadError.message}`);
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
