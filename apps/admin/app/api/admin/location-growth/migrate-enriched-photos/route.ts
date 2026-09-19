import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_LOCATION_ENRICHMENT_FIELDS } from "@/lib/admin/location-data-projections";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GOOGLE_PHOTO_PREFIX = "https://maps.googleapis.com/maps/api/place/photo";
const BAD_PHOTO_VALUES = ["placeholder", "default-image", "no-image", "no image", "missing", "undefined", "null"];
type MigrationMode = "repair_bad_placeholders" | "google_endpoint_to_storage" | "repair_missing_completed";

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  if (process.env.IMPORT_SECRET && request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET) return null;
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  return error;
}
function text(value: unknown) { return String(value || "").trim(); }
function isGooglePhotoEndpoint(value: unknown) { return text(value).startsWith(GOOGLE_PHOTO_PREFIX); }
function isStoragePhoto(value: unknown) { const normalized = text(value).toLowerCase(); return normalized.includes("/storage/v1/object/public/location-images/") || normalized.includes("location-images"); }
function isOwnerOrAdminPhoto(row: Record<string, unknown>) { const source = text(row.photo_source).toLowerCase(); return source.includes("owner") || source.includes("admin"); }
function isBadPhotoValue(value: unknown) { const normalized = text(value).toLowerCase(); return normalized.length > 0 && BAD_PHOTO_VALUES.some((bad) => normalized.includes(bad)); }
function hasUsableProtectedPhoto(row: Record<string, unknown>) { return isOwnerOrAdminPhoto(row) || isStoragePhoto(row.main_image) || isStoragePhoto(row.image_url) || (Array.isArray(row.gallery_images) && row.gallery_images.some(isStoragePhoto)); }

function buildModeQuery(mode: MigrationMode, limit: number) {
  let query = supabaseAdmin.from("locations").select(ADMIN_LOCATION_ENRICHMENT_FIELDS).limit(limit);
  if (mode === "repair_bad_placeholders") query = query.or(BAD_PHOTO_VALUES.flatMap((value) => [`main_image.ilike.%${value}%`, `image_url.ilike.%${value}%`]).join(","));
  if (mode === "google_endpoint_to_storage") query = query.or("main_image.ilike.https://maps.googleapis.com/maps/api/place/photo%,image_url.ilike.https://maps.googleapis.com/maps/api/place/photo%");
  if (mode === "repair_missing_completed") query = query.eq("enrichment_status", "completed").or("has_photos.eq.false,photo_status.eq.missing_photo,main_image.is.null,image_url.is.null");
  return query;
}

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const skipAdminImportEmail = request.headers.get("x-skip-admin-import-email") === "true";
  const emailResult = { sent: false, provider: skipAdminImportEmail ? "skipped_cron_summary_email" : "manual_email_not_requested", error: null };
  const auth = await authorize(request);
  if (auth) return auth;
  const body = await request.json().catch(() => ({}));
  const mode = String(body.mode || "") as MigrationMode;
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 250);
  if (!["repair_bad_placeholders", "google_endpoint_to_storage", "repair_missing_completed"].includes(mode)) {
    const finishedAt = new Date().toISOString();
    return NextResponse.json({ success: false, error: "Unsupported photo migration mode.", found: 0, processed: 0, imported: 0, updated: 0, migrated: 0, enriched: 0, skipped: 0, failed: 1, needsPhoto: null, publishReady: null, review: null, rejected: null, hasMore: false, startedAt, finishedAt, durationMs: Date.now() - startedAtMs, emailSent: emailResult.sent, emailProvider: emailResult.provider, emailError: emailResult.error }, { status: 400 });
  }

  const { data, error } = await buildModeQuery(mode, limit);
  if (error) {
    const finishedAt = new Date().toISOString();
    return NextResponse.json({ success: false, error: error.message, found: 0, processed: 0, imported: 0, updated: 0, migrated: 0, enriched: 0, skipped: 0, failed: 1, needsPhoto: null, publishReady: null, review: null, rejected: null, hasMore: false, startedAt, finishedAt, durationMs: Date.now() - startedAtMs, emailSent: emailResult.sent, emailProvider: emailResult.provider, emailError: emailResult.error }, { status: 500 });
  }

  let processed = 0, repaired = 0, migrated = 0, skipped = 0, failed = 0;
  for (const row of data || []) {
    processed += 1;
    try {
      if (hasUsableProtectedPhoto(row)) { skipped += 1; continue; }
      if (mode === "repair_bad_placeholders") {
        const updates: Record<string, unknown> = {};
        if (isBadPhotoValue(row.main_image)) updates.main_image = null;
        if (isBadPhotoValue(row.image_url)) updates.image_url = null;
        if (isBadPhotoValue(row.main_image) || isBadPhotoValue(row.image_url)) { updates.has_photos = false; updates.photo_status = "missing_photo"; }
        if (!Object.keys(updates).length) { skipped += 1; continue; }
        const { error: updateError } = await supabaseAdmin.from("locations").update(updates).eq("id", row.id);
        if (updateError) throw updateError;
        repaired += 1;
        continue;
      }
      if (mode === "google_endpoint_to_storage") {
        const hasLegacyEndpoint = isGooglePhotoEndpoint(row.main_image) || isGooglePhotoEndpoint(row.image_url);
        const placeId = text(row.google_place_id);
        if (!hasLegacyEndpoint || !placeId) { skipped += 1; continue; }
        const stored = await cacheGooglePlacePhotoToStorage({ id: String(row.id), name: text(row.name) || null, restaurant_name: text(row.restaurant_name) || null, activity_name: text(row.activity_name) || null, google_place_id: placeId });
        const { error: updateError } = await supabaseAdmin.from("locations").update({
          main_image: stored.publicUrl, image_url: stored.publicUrl, gallery_images: [stored.publicUrl],
          ...getPhotoPublishabilityUpdates({ ...row, main_image: stored.publicUrl, image_url: stored.publicUrl, gallery_images: [stored.publicUrl], photo_status: "google_photo" }),
          photo_status: "google_photo", photo_source: "google_places_new", photo_storage_path: stored.objectPath, photo_backfilled_at: new Date().toISOString(), photo_backfill_error: null,
        }).eq("id", row.id);
        if (updateError) throw updateError;
        migrated += 1;
        continue;
      }
      if (mode === "repair_missing_completed") {
        const { error: updateError } = await supabaseAdmin.from("locations").update({ enrichment_status: "queued", has_photos: false, photo_status: "missing_photo", photo_backfill_error: null }).eq("id", row.id);
        if (updateError) throw updateError;
        repaired += 1;
      }
    } catch { failed += 1; }
  }

  const finishedAt = new Date().toISOString();
  return NextResponse.json({ success: true, mode, found: data?.length || 0, processed, repaired, imported: 0, updated: repaired, migrated, enriched: 0, skipped, failed, needsPhoto: mode === "repair_missing_completed" ? repaired : null, publishReady: null, review: null, rejected: null, hasMore: (data?.length || 0) >= limit, startedAt, finishedAt, durationMs: Date.now() - startedAtMs, emailSent: emailResult.sent, emailProvider: emailResult.provider, emailError: emailResult.error });
}
