import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { buildLocationCleanupUpdates } from "@/lib/location-growth/cleanExistingLocations";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GOOGLE_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const PHOTO_BUCKET = "location-images";

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET
  ) {
    return null;
  }
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  return error;
}

function text(value: unknown) {
  return String(value || "").trim();
}

function missing(value: unknown) {
  return (
    value == null ||
    text(value).length === 0 ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isBadPhotoValue(value: unknown) {
  const normalized = text(value).toLowerCase();
  return (
    !normalized ||
    ["null", "undefined", "none", "missing", "no image", "no-image"].includes(
      normalized,
    ) ||
    normalized.includes("placeholder") ||
    normalized.includes("default-image")
  );
}

function isProtectedPhoto(row: Record<string, unknown>) {
  const source = text(row.photo_source || row.main_image_source).toLowerCase();
  const uploadedBy = text(row.main_image_uploaded_by || row.photo_uploaded_by);
  const mainImage = text(row.main_image || row.image_url);
  return (
    ["owner", "admin", "supabase", "storage"].some((safe) =>
      source.includes(safe),
    ) ||
    Boolean(uploadedBy) ||
    mainImage.includes("/storage/v1/object/public/location-images/") ||
    mainImage.includes("location-images")
  );
}

function hasGoodPhoto(row: Record<string, unknown>) {
  const main = row.main_image;
  const image = row.image_url;
  const gallery = row.gallery_images;
  return (
    (!isBadPhotoValue(main) || !isBadPhotoValue(image) ||
      (Array.isArray(gallery) && gallery.some((item) => !isBadPhotoValue(item)))) &&
    Boolean(row.has_photos)
  );
}

async function googleFind(row: Record<string, unknown>) {
  if (!GOOGLE_API_KEY) throw new Error("Missing Google Places API key.");
  const input = [row.name || row.restaurant_name || row.activity_name, row.address, row.city, row.state]
    .map(text)
    .filter(Boolean)
    .join(" ");
  const findUrl = new URL(
    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
  );
  findUrl.searchParams.set("input", input);
  findUrl.searchParams.set("inputtype", "textquery");
  findUrl.searchParams.set("fields", "place_id");
  findUrl.searchParams.set("key", GOOGLE_API_KEY);
  const findRes = await fetch(findUrl);
  if (!findRes.ok) throw new Error(`Google find failed: ${findRes.status}`);
  const find = await findRes.json();
  const placeId = row.google_place_id || find.candidates?.[0]?.place_id;
  if (!placeId) return null;
  const detailUrl = new URL(
    "https://maps.googleapis.com/maps/api/place/details/json",
  );
  detailUrl.searchParams.set("place_id", String(placeId));
  detailUrl.searchParams.set(
    "fields",
    "place_id,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,types,geometry,photos",
  );
  detailUrl.searchParams.set("key", GOOGLE_API_KEY);
  const detailsRes = await fetch(detailUrl);
  if (!detailsRes.ok) throw new Error(`Google details failed: ${detailsRes.status}`);
  const details = await detailsRes.json();
  return details.result || { place_id: placeId };
}

async function storeGooglePhoto(locationId: string | number, photoReference: string) {
  if (!GOOGLE_API_KEY) throw new Error("Missing Google Places API key.");
  const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
  photoUrl.searchParams.set("maxwidth", "1200");
  photoUrl.searchParams.set("photo_reference", photoReference);
  photoUrl.searchParams.set("key", GOOGLE_API_KEY);

  const response = await fetch(photoUrl, { redirect: "follow" });
  if (!response.ok) throw new Error(`Google photo download failed: ${response.status}`);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error("Google photo response was not an image.");
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const bytes = new Uint8Array(await response.arrayBuffer());
  const storagePath = `locations/${locationId}/google-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: false });
  if (uploadError) throw uploadError;
  const { data } = supabaseAdmin.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath);
  return { publicUrl: data.publicUrl, storagePath };
}

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const skipAdminImportEmail = request.headers.get("x-skip-admin-import-email") === "true";
  const emailResult = {
    sent: false,
    provider: skipAdminImportEmail ? "skipped_cron_summary_email" : "manual_email_not_requested",
    error: null,
  };

  const auth = await authorize(request);
  if (auth) return auth;
  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);

  if (!GOOGLE_API_KEY) {
    const finishedAt = new Date().toISOString();
    return NextResponse.json({
      success: false,
      error: "Missing Google Places API key.",
      found: 0,
      processed: 0,
      imported: 0,
      updated: 0,
      migrated: 0,
      enriched: 0,
      skipped: 0,
      failed: 1,
      needsPhoto: null,
      publishReady: null,
      review: null,
      rejected: null,
      hasMore: false,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtMs,
      emailSent: emailResult.sent,
      emailProvider: emailResult.provider,
      emailError: emailResult.error,
    }, { status: 500 });
  }
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .gte("quality_score", 75)
    .eq("duplicate_status", "unique")
    .or("has_photos.eq.false,photo_status.eq.missing_photo,main_image.is.null,image_url.is.null")
    .in("enrichment_status", ["queued", "not_started", "failed", "completed"])
    .order("has_photos", { ascending: true, nullsFirst: true })
    .order("enrichment_priority", { ascending: false })
    .order("rating", { ascending: false, nullsFirst: false })
    .order("quality_score", { ascending: false })
    .limit(limit);
  if (error) {
    const finishedAt = new Date().toISOString();
    return NextResponse.json({
      success: false,
      error: error.message,
      found: 0,
      processed: 0,
      imported: 0,
      updated: 0,
      migrated: 0,
      enriched: 0,
      skipped: 0,
      failed: 1,
      needsPhoto: null,
      publishReady: null,
      review: null,
      rejected: null,
      hasMore: false,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtMs,
      emailSent: emailResult.sent,
      emailProvider: emailResult.provider,
      emailError: emailResult.error,
    }, { status: 500 });
  }

  let completed = 0;
  let failed = 0;
  let skippedAlreadyGood = 0;
  for (const row of data || []) {
    try {
      if (hasGoodPhoto(row) || isProtectedPhoto(row)) {
        skippedAlreadyGood += 1;
        continue;
      }

      const place = await googleFind(row);
      const checkedAt = new Date().toISOString();
      const updates: Record<string, unknown> = {
        enrichment_status: "completed",
        last_enriched_at: checkedAt,
      };
      if (!place) {
        updates.photo_status = "missing_photo";
        updates.has_photos = false;
        updates.photo_backfill_error =
          "No Google Places match found for this location.";
        updates.photo_backfill_checked_at = checkedAt;
      } else {
        if (missing(row.google_place_id) && place.place_id) updates.google_place_id = place.place_id;
        if (missing(row.phone)) {
          updates.phone = place.formatted_phone_number || place.international_phone_number || null;
        }
        if (missing(row.website) && place.website) updates.website = place.website;
        if (missing(row.rating) && place.rating) updates.rating = place.rating;
        if (missing(row.review_count) && place.user_ratings_total) updates.review_count = place.user_ratings_total;
        if (missing(row.google_types) && place.types) updates.google_types = place.types;
        if (missing(row.latitude) && place.geometry?.location?.lat) updates.latitude = place.geometry.location.lat;
        if (missing(row.longitude) && place.geometry?.location?.lng) updates.longitude = place.geometry.location.lng;

        const photoRef = place.photos?.[0]?.photo_reference;
        if (photoRef && !hasGoodPhoto({ ...row, ...updates }) && !isProtectedPhoto(row)) {
          const stored = await storeGooglePhoto(row.id as string | number, photoRef);
          updates.main_image = stored.publicUrl;
          updates.image_url = stored.publicUrl;
          updates.gallery_images = [stored.publicUrl];
          updates.has_photos = true;
          updates.photo_status = "google_photo";
          updates.photo_source = "google_places";
          updates.photo_storage_path = stored.storagePath;
          updates.photo_backfilled_at = checkedAt;
          updates.photo_backfill_checked_at = checkedAt;
          updates.photo_backfill_error = null;
        } else if (!photoRef && !hasGoodPhoto({ ...row, ...updates })) {
          updates.photo_status = "missing_photo";
          updates.has_photos = false;
          updates.photo_backfill_error =
            "Google Places returned no photo for this location.";
          updates.photo_backfill_checked_at = checkedAt;
        }
      }
      const recalculated = buildLocationCleanupUpdates({ ...row, ...updates });
      Object.assign(updates, recalculated);
      const { error: updateError } = await supabaseAdmin
        .from("locations")
        .update(updates)
        .eq("id", row.id);
      if (updateError) throw updateError;
      completed += 1;
    } catch (error) {
      failed += 1;
      await supabaseAdmin
        .from("locations")
        .update({
          enrichment_status: "failed",
          last_enriched_at: new Date().toISOString(),
          photo_backfill_error: error instanceof Error ? error.message : String(error),
          photo_backfill_checked_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }
  const finishedAt = new Date().toISOString();

  return NextResponse.json({
    success: true,
    found: data?.length || 0,
    processed: data?.length || 0,
    completed,
    imported: 0,
    updated: completed,
    migrated: 0,
    enriched: completed,
    skipped: skippedAlreadyGood,
    skippedAlreadyGood,
    failed,
    needsPhoto: failed,
    publishReady: null,
    review: null,
    rejected: null,
    hasMore: (data?.length || 0) >= limit,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startedAtMs,
    emailSent: emailResult.sent,
    emailProvider: emailResult.provider,
    emailError: emailResult.error,
  });
}
