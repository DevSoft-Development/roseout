import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_LOCATION_ENRICHMENT_FIELDS } from "@/lib/admin/location-data-projections";
import { buildLocationCleanupUpdates } from "@/lib/location-growth/cleanExistingLocations";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";
import { findGooglePlaceForLocation, getGooglePlaceDetails } from "@/lib/google/places";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  if (process.env.IMPORT_SECRET && request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET) return null;
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  return error;
}

function text(value: unknown) { return String(value || "").trim(); }
function missing(value: unknown) { return value == null || text(value).length === 0 || (Array.isArray(value) && value.length === 0); }
function isBadPhotoValue(value: unknown) {
  const normalized = text(value).toLowerCase();
  return !normalized || ["null", "undefined", "none", "missing", "no image", "no-image"].includes(normalized) || normalized.includes("placeholder") || normalized.includes("default-image");
}
function isProtectedPhoto(row: Record<string, unknown>) {
  const source = text(row.photo_source).toLowerCase();
  const mainImage = text(row.main_image || row.image_url);
  return ["owner", "admin", "supabase", "storage"].some((safe) => source.includes(safe)) || mainImage.includes("/storage/v1/object/public/location-images/") || mainImage.includes("location-images");
}
function hasGoodPhoto(row: Record<string, unknown>) {
  const gallery = row.gallery_images;
  return ((!isBadPhotoValue(row.main_image) || !isBadPhotoValue(row.image_url) || (Array.isArray(gallery) && gallery.some((item) => !isBadPhotoValue(item)))) && Boolean(row.has_photos));
}

async function googleFind(row: Record<string, unknown>) {
  const existingPlaceId = text(row.google_place_id);
  if (existingPlaceId) {
    try { return await getGooglePlaceDetails(existingPlaceId); } catch { /* stale ID; fall through */ }
  }
  const match = await findGooglePlaceForLocation(row);
  if (!match.place?.id) return null;
  return getGooglePlaceDetails(match.place.id);
}

function emptyResult(startedAt: string, startedAtMs: number, emailResult: { sent: boolean; provider: string; error: null }, error: string, status = 500) {
  const finishedAt = new Date().toISOString();
  return NextResponse.json({ success: false, error, found: 0, processed: 0, imported: 0, updated: 0, migrated: 0, enriched: 0, skipped: 0, failed: 1, needsPhoto: null, publishReady: null, review: null, rejected: null, hasMore: false, startedAt, finishedAt, durationMs: Date.now() - startedAtMs, emailSent: emailResult.sent, emailProvider: emailResult.provider, emailError: emailResult.error }, { status });
}

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const skipAdminImportEmail = request.headers.get("x-skip-admin-import-email") === "true";
  const emailResult = { sent: false, provider: skipAdminImportEmail ? "skipped_cron_summary_email" : "manual_email_not_requested", error: null };
  const auth = await authorize(request);
  if (auth) return auth;
  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);
  if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) return emptyResult(startedAt, startedAtMs, emailResult, "Missing GOOGLE_PLACES_API_KEY.");

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(ADMIN_LOCATION_ENRICHMENT_FIELDS)
    .gte("quality_score", 75)
    .eq("duplicate_status", "unique")
    .or("has_photos.eq.false,photo_status.eq.missing_photo,main_image.is.null,image_url.is.null")
    .in("enrichment_status", ["queued", "not_started", "failed", "completed"])
    .order("has_photos", { ascending: true, nullsFirst: true })
    .order("enrichment_priority", { ascending: false })
    .order("rating", { ascending: false, nullsFirst: false })
    .order("quality_score", { ascending: false })
    .limit(limit);
  if (error) return emptyResult(startedAt, startedAtMs, emailResult, error.message);

  let completed = 0;
  let failed = 0;
  let skippedAlreadyGood = 0;
  for (const row of data || []) {
    try {
      if (hasGoodPhoto(row) || isProtectedPhoto(row)) { skippedAlreadyGood += 1; continue; }
      const place = await googleFind(row);
      const checkedAt = new Date().toISOString();
      const updates: Record<string, unknown> = { enrichment_status: "completed", last_enriched_at: checkedAt };
      if (!place) {
        updates.photo_status = "missing_photo";
        updates.has_photos = false;
        updates.photo_backfill_error = "No Google Places match found for this location.";
        updates.photo_backfill_checked_at = checkedAt;
      } else {
        const placeId = place.id || text(row.google_place_id) || null;
        if (missing(row.google_place_id) && placeId) updates.google_place_id = placeId;
        if (missing(row.phone)) updates.phone = place.nationalPhoneNumber || null;
        if (missing(row.website) && place.websiteUri) updates.website = place.websiteUri;
        if (missing(row.rating) && place.rating) updates.rating = place.rating;
        if (missing(row.review_count) && place.userRatingCount) updates.review_count = place.userRatingCount;
        if (missing(row.google_types) && place.types) updates.google_types = place.types;
        if (missing(row.latitude) && place.location?.latitude) updates.latitude = place.location.latitude;
        if (missing(row.longitude) && place.location?.longitude) updates.longitude = place.location.longitude;
        if (missing(row.google_maps_url) && place.googleMapsUri) updates.google_maps_url = place.googleMapsUri;
        if (placeId && !hasGoodPhoto({ ...row, ...updates }) && !isProtectedPhoto(row)) {
          try {
            const stored = await cacheGooglePlacePhotoToStorage({ id: String(row.id), name: text(row.name) || null, restaurant_name: text(row.restaurant_name) || null, activity_name: text(row.activity_name) || null, google_place_id: placeId });
            updates.main_image = stored.publicUrl;
            updates.image_url = stored.publicUrl;
            updates.gallery_images = [stored.publicUrl];
            updates.has_photos = true;
            updates.photo_status = "google_photo";
            updates.photo_source = "google_places_new";
            updates.photo_storage_path = stored.objectPath;
            updates.photo_backfilled_at = checkedAt;
            updates.photo_backfill_checked_at = checkedAt;
            updates.photo_backfill_error = null;
            Object.assign(updates, getPhotoPublishabilityUpdates({ ...row, ...updates }));
            updates.photo_status = "google_photo";
          } catch (photoError) {
            updates.photo_status = "missing_photo";
            updates.has_photos = false;
            updates.photo_backfill_error = photoError instanceof Error ? photoError.message : String(photoError);
            updates.photo_backfill_checked_at = checkedAt;
          }
        } else if (!hasGoodPhoto({ ...row, ...updates })) {
          updates.photo_status = "missing_photo";
          updates.has_photos = false;
          updates.photo_backfill_error = "Google Places returned no usable photo for this location.";
          updates.photo_backfill_checked_at = checkedAt;
        }
      }
      Object.assign(updates, buildLocationCleanupUpdates({ ...row, ...updates }));
      const { error: updateError } = await supabaseAdmin.from("locations").update(updates).eq("id", row.id);
      if (updateError) throw updateError;
      completed += 1;
    } catch (itemError) {
      failed += 1;
      await supabaseAdmin.from("locations").update({ enrichment_status: "failed", last_enriched_at: new Date().toISOString(), photo_backfill_error: itemError instanceof Error ? itemError.message : String(itemError), photo_backfill_checked_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
  const finishedAt = new Date().toISOString();
  return NextResponse.json({ success: true, found: data?.length || 0, processed: data?.length || 0, completed, imported: 0, updated: completed, migrated: 0, enriched: completed, skipped: skippedAlreadyGood, skippedAlreadyGood, failed, needsPhoto: failed, publishReady: null, review: null, rejected: null, hasMore: (data?.length || 0) >= limit, startedAt, finishedAt, durationMs: Date.now() - startedAtMs, emailSent: emailResult.sent, emailProvider: emailResult.provider, emailError: emailResult.error });
}
