import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runGooglePlacesImport, type GooglePlacesImportOptions } from "@/lib/googlePlacesImport";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncActivityToLocation, syncRestaurantToLocation } from "@/lib/sync-location";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function numberFrom(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

function isCronAuthorized(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return true;
  const importSecret = request.headers.get("x-internal-import-secret");
  const bearerToken = getBearerToken(request);
  if (process.env.IMPORT_SECRET && importSecret === process.env.IMPORT_SECRET) return true;
  return Boolean(process.env.CRON_SECRET && bearerToken === process.env.CRON_SECRET);
}

async function authorize(request: NextRequest) {
  if (isCronAuthorized(request)) return null;
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  return error;
}

function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function optionsFromSearchParams(request: NextRequest): GooglePlacesImportOptions {
  const { searchParams } = request.nextUrl;
  return {
    type: (searchParams.get("type") as GooglePlacesImportOptions["type"]) || "both",
    limit: boundedNumber(searchParams.get("limit"), 8, 1, 20),
    batch: searchParams.get("batch") || "all",
    primaryTag: searchParams.get("primaryTag") || searchParams.get("batch") || "all",
    areas: searchParams.get("areas") || searchParams.get("area") || "extended",
    minRating: boundedNumber(searchParams.get("minRating"), 3.8, 0, 5),
    requirePhoto: searchParams.get("requirePhoto") !== "false",
    requirePhone: searchParams.get("requirePhone") !== "false",
    requireWebsite: searchParams.get("requireWebsite") !== "false",
    requireLocation: searchParams.get("requireLocation") !== "false",
    requireCuisineType: searchParams.get("requireCuisineType") !== "false",
    requireHours: searchParams.get("requireHours") !== "false",
    maxQueries: boundedNumber(searchParams.get("maxQueries"), 6, 1, 12),
    requestedMarket: searchParams.get("market") || searchParams.get("requestedMarket") || null,
    requestedArea: searchParams.get("areas") || searchParams.get("area") || null,
    allowMarketCorrection: searchParams.get("allowMarketCorrection") === "true",
    maxRuntimeMs: 270_000,
    stopAfterChecked: boundedNumber(searchParams.get("stopAfterChecked"), 240, 20, 500),
    stopAfterImported: boundedNumber(searchParams.get("stopAfterImported"), 60, 5, 100),
  };
}

type ImportedLocationSummary = {
  id?: string | number | null;
  name?: string | null;
  location_type?: string | null;
  locationType?: string | null;
};

async function cacheImportedPhotos(result: Record<string, unknown>) {
  const added = Array.isArray(result.addedLocations)
    ? (result.addedLocations as ImportedLocationSummary[])
    : [];
  let cached = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of added) {
    const id = item.id == null ? "" : String(item.id);
    const rawType = String(item.location_type || item.locationType || "").toLowerCase();
    const table = rawType.includes("activity") ? "activities" : "restaurants";
    if (!id) continue;

    try {
      const { data: row, error: readError } = await supabaseAdmin
        .from(table)
        .select("*")
        .eq("id", id)
        .single();
      if (readError || !row) throw new Error(readError?.message || "Imported location was not found.");

      const stored = await cacheGooglePlacePhotoToStorage({
        id,
        name: row.name,
        restaurant_name: row.restaurant_name,
        activity_name: row.activity_name,
        google_place_id: row.google_place_id,
      });

      const now = new Date().toISOString();
      const { data: updatedRow, error: updateError } = await supabaseAdmin
        .from(table)
        .update({
          image_url: stored.publicUrl,
          main_image: stored.publicUrl,
          image_storage_path: stored.objectPath,
          image_status: "cached",
          image_cached_at: now,
          photo_status: "google_photo",
          import_last_error: null,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (updateError || !updatedRow) throw new Error(updateError?.message || "Photo metadata was not saved.");

      if (table === "activities") {
        await syncActivityToLocation(updatedRow as Record<string, unknown> & { id: string | number });
      } else {
        await syncRestaurantToLocation(updatedRow as Record<string, unknown> & { id: string | number });
      }
      cached += 1;
    } catch (error) {
      failed += 1;
      const message = `${item.name || id}: ${getErrorMessage(error)}`;
      errors.push(message);
      await supabaseAdmin
        .from(table)
        .update({ image_status: "failed", import_last_error: message, import_attempt_count: 1 })
        .eq("id", id);
    }
  }

  return { cached, failed, errors };
}

async function enrichRunResult(result: Record<string, unknown>) {
  const photos = await cacheImportedPhotos(result);
  return {
    ...result,
    images_cached_count: photos.cached,
    image_cache_failed_count: photos.failed,
    image_cache_errors: photos.errors,
  };
}

function withRunStatus(result: Record<string, unknown>) {
  const imported = numberFrom(result.imported);
  const failed = numberFrom(result.failed) + numberFrom(result.image_cache_failed_count);
  const partial = result.partial === true;
  const status = failed > 0 && imported === 0
    ? "failed"
    : partial || failed > 0
      ? "partially_successful"
      : "successful";

  return {
    ...result,
    run_status: status,
    completed: status === "successful",
    needs_continuation: partial,
    quality_gate: {
      hours_required: true,
      image_required: true,
      canonical_profile_required: true,
      market_validation_required: true,
      duplicate_clearance_required: true,
    },
  };
}

async function persistImportLog(result: Record<string, unknown>, source: "manual" | "cron") {
  const runDate = new Date().toISOString();
  const imported = numberFrom(result.imported ?? result.imported_count);
  const duplicates = numberFrom(result.skipped_duplicate ?? result.duplicate_count);
  const importFailed = numberFrom(result.failed);
  const photoFailed = numberFrom(result.image_cache_failed_count);
  const failed = importFailed + photoFailed;
  const reservationCount = Array.isArray(result.addedLocations)
    ? (result.addedLocations as Array<Record<string, unknown>>).filter((item) =>
        Boolean(item.reservation_url || item.booking_url || item.reservation_link),
      ).length
    : numberFrom(result.reservation_count);

  const meta = {
    source,
    run_status: result.run_status,
    checked_count: numberFrom(result.checked),
    inserted_count: imported,
    imported_count: imported,
    skipped_count: numberFrom(result.skipped),
    duplicate_count: duplicates,
    import_failed_count: importFailed,
    failed_count: failed,
    images_cached_count: numberFrom(result.images_cached_count),
    image_cache_failed_count: photoFailed,
    image_cache_errors: Array.isArray(result.image_cache_errors) ? result.image_cache_errors : [],
    reservation_count: reservationCount,
    profiles_queued_count: numberFrom(result.profiles_queued_count),
    hours_saved_count: numberFrom(result.hours_saved_count),
    published_count: numberFrom(result.published_count),
    needs_review_count: numberFrom(result.needs_review_count),
    imported_by_market: recordFrom(result.imported_by_market),
    skipped_by_reason: recordFrom(result.skipped_by_reason),
    failure_reasons: recordFrom(result.failure_reasons ?? result.skipped_by_reason),
    market_summary: recordFrom(result.market_summary ?? result.imported_by_market),
    enrichment_summary: {
      images_cached: numberFrom(result.images_cached_count),
      image_failures: photoFailed,
      reservations: reservationCount,
      profiles_queued: numberFrom(result.profiles_queued_count),
    },
    partial: result.partial === true,
    paused_reason: result.paused_reason ?? null,
    cursor: result.cursor ?? null,
  };

  const importErrors = Array.isArray(result.errors) ? result.errors : [];
  const photoErrors = Array.isArray(result.image_cache_errors) ? result.image_cache_errors : [];
  const errorSummary = [...importErrors, ...photoErrors].filter(Boolean).slice(0, 10).join("; ");

  const { error } = await supabaseAdmin.from("import_logs").insert({
    job_name: source === "cron" ? "Nightly Google import" : "Manual Google import",
    run_date: runDate,
    created_at: runDate,
    meta,
    error: failed > 0 ? String(errorSummary || result.error || "") : null,
  });

  if (error) {
    console.error("Unable to persist Google import log", error.message);
  }
}

async function completeRun(result: Record<string, unknown>, source: "manual" | "cron") {
  const enriched = await enrichRunResult(result);
  const completed = withRunStatus(enriched) as Record<string, unknown>;
  await persistImportLog(completed, source);
  return completed;
}

export async function GET(request: NextRequest) {
  try {
    const authError = await authorize(request);
    if (authError) return authError;
    const result = await runGooglePlacesImport(optionsFromSearchParams(request));
    return NextResponse.json(await completeRun(result as Record<string, unknown>, "cron"));
  } catch (error: unknown) {
    const failed = { success: false, run_status: "failed", failed: 1, error: getErrorMessage(error) || "Google import failed" };
    await persistImportLog(failed, "cron");
    return NextResponse.json(failed, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await authorize(request);
    if (authError) return authError;
    const body = await request.json().catch(() => ({}));
    const result = await runGooglePlacesImport({
      type: body.type || "both",
      limit: Math.min(8, Math.max(1, Number(body.limit || 5))),
      batch: body.batch || "all",
      primaryTag: body.primaryTag || body.batch || "all",
      areas: body.areas || body.area || "nyc",
      minRating: Number(body.minRating || 3.8),
      requirePhoto: body.requirePhoto !== false,
      requirePhone: body.requirePhone !== false,
      requireWebsite: body.requireWebsite !== false,
      requireLocation: body.requireLocation !== false,
      requireCuisineType: body.requireCuisineType !== false,
      requireHours: body.requireHours !== false,
      maxQueries: Math.min(4, Math.max(1, Number(body.maxQueries || 2))),
      requestedMarket: body.market || body.requestedMarket || null,
      requestedArea: body.areas || body.area || null,
      allowMarketCorrection: body.allowMarketCorrection === true,
      cursor: body.cursor || null,
      interactive: true,
      maxRuntimeMs: 45_000,
      stopAfterChecked: 30,
      stopAfterImported: 10,
    });
    return NextResponse.json(await completeRun(result as Record<string, unknown>, "manual"));
  } catch (error: unknown) {
    const failed = { success: false, run_status: "failed", failed: 1, error: getErrorMessage(error) || "Google import failed" };
    await persistImportLog(failed, "manual");
    return NextResponse.json(failed, { status: 500 });
  }
}
