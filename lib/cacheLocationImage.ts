import crypto from "crypto";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const LOCATION_IMAGE_BUCKET = "location-images";

type LocationImageRecord = Record<string, unknown> & {
  id?: string | number;
  images?: unknown[];
  google_place_id?: string | null;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function isGooglePlacesPhotoUrl(value: unknown) {
  const url = clean(value);

  if (!url) return false;

  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "maps.googleapis.com" &&
      parsed.pathname.startsWith("/maps/api/place/photo")
    );
  } catch {
    return false;
  }
}

function isAlreadyProjectImage(value: unknown) {
  const url = clean(value);

  if (!url) return false;

  return (
    url.includes("/storage/v1/object/public/location-images/") ||
    url.includes("/storage/v1/object/sign/location-images/")
  );
}

function getExtensionFromContentType(contentType: string | null) {
  const normalized = clean(contentType).toLowerCase();

  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";

  return "jpg";
}

function safeSlug(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "location";
}

async function cacheExternalImageToStorage(
  location: LocationImageRecord,
  sourceUrl: string,
) {
  const response = await fetch(sourceUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "TheOutHaven/1.0",
    },
  });

  if (!response.ok) {
    return {
      cached: false,
      reason: "source_fetch_failed",
      status: response.status,
      statusText: response.statusText,
    };
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";

  if (!contentType.toLowerCase().startsWith("image/")) {
    return {
      cached: false,
      reason: "source_not_image",
      contentType,
    };
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!buffer.length) {
    return {
      cached: false,
      reason: "empty_image_buffer",
    };
  }

  const hash = crypto
    .createHash("sha256")
    .update(sourceUrl)
    .digest("hex")
    .slice(0, 24);

  const ext = getExtensionFromContentType(contentType);
  const locationId = clean(location?.id) || hash;
  const slug = safeSlug(
    location?.name ||
      location?.restaurant_name ||
      location?.activity_name ||
      "location",
  );

  const objectPath = `${slug}/${locationId}-${hash}.${ext}`;

  const uploadResult = await supabaseAdmin.storage
    .from(LOCATION_IMAGE_BUCKET)
    .upload(objectPath, buffer, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });

  if (uploadResult.error) {
    const errorMessage = uploadResult.error.message;
    const missingBucket = errorMessage.toLowerCase().includes("bucket");

    return {
      cached: false,
      reason: missingBucket ? "storage_bucket_missing" : "storage_upload_failed",
      error: missingBucket
        ? `Supabase Storage bucket "${LOCATION_IMAGE_BUCKET}" is missing or inaccessible. Create it with supabase/create-location-images-bucket.sql or create a public bucket named "${LOCATION_IMAGE_BUCKET}" that allows image/jpeg, image/png, image/webp, and image/gif.`
        : errorMessage,
    };
  }

  const publicUrlResult = supabaseAdmin.storage
    .from(LOCATION_IMAGE_BUCKET)
    .getPublicUrl(objectPath);

  const publicUrl = publicUrlResult.data.publicUrl;

  if (!publicUrl) {
    return {
      cached: false,
      reason: "missing_public_url",
    };
  }

  return {
    cached: true,
    publicUrl,
    objectPath,
    contentType,
    sizeBytes: buffer.length,
  };
}

export async function cacheLocationImageToStorage(location: LocationImageRecord) {
  const sourceUrl =
    clean(location?.main_image) ||
    clean(location?.image_url) ||
    (Array.isArray(location?.images) ? clean(location.images[0]) : "");

  if (!sourceUrl) {
    return {
      cached: false,
      reason: "missing_source_url",
    };
  }

  if (isAlreadyProjectImage(sourceUrl)) {
    return {
      cached: false,
      skipped: true,
      reason: "already_project_image",
      publicUrl: sourceUrl,
    };
  }

  if (isGooglePlacesPhotoUrl(sourceUrl)) {
    const placeId = clean(location.google_place_id);
    if (!placeId) {
      return {
        cached: false,
        reason: "legacy_google_photo_missing_place_id",
      };
    }

    try {
      const cached = await cacheGooglePlacePhotoToStorage({
        id: clean(location.id),
        name: clean(location.name) || null,
        restaurant_name: clean(location.restaurant_name) || null,
        activity_name: clean(location.activity_name) || null,
        google_place_id: placeId,
      });

      return {
        cached: true,
        publicUrl: cached.publicUrl,
        objectPath: cached.objectPath,
        contentType: cached.contentType,
        sizeBytes: cached.bytes,
        migratedVia: "places_api_new",
      };
    } catch (error) {
      return {
        cached: false,
        reason: "places_api_new_cache_failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return cacheExternalImageToStorage(location, sourceUrl);
}

export async function updateLocationImageWithCachedUrl(location: LocationImageRecord) {
  const result = await cacheLocationImageToStorage(location);

  if (!result.cached || !result.publicUrl) {
    return result;
  }

  const images = Array.isArray(location?.images)
    ? [
        result.publicUrl,
        ...location.images.filter((item: unknown) => clean(item) !== result.publicUrl),
      ]
    : [result.publicUrl];

  const mergedLocation = {
    ...location,
    main_image: result.publicUrl,
    image_url: result.publicUrl,
    images,
    photo_status: "storage_cached",
  };
  const updatePayload = {
    main_image: result.publicUrl,
    image_url: result.publicUrl,
    images,
    ...getPhotoPublishabilityUpdates(mergedLocation),
    photo_status: "storage_cached",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("locations")
    .update(updatePayload)
    .eq("id", location.id);

  if (error) {
    return {
      cached: false,
      reason: "database_update_failed",
      error: error.message,
      publicUrl: result.publicUrl,
    };
  }

  return {
    ...result,
    databaseUpdated: true,
  };
}
