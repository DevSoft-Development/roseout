import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminOrCron } from "../_shared/auth.ts";
import { hasValidPhoto } from "../_shared/photos.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";
import type { PostgrestError, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const FULL_LOCATION_SELECT = "id,name,restaurant_name,activity_name,address,city,state,zip_code,place_id,google_place_id,image_url,photo_url,has_photos,photo_status";
const MINIMAL_LOCATION_SELECT = "id,name,address,city,state,zip_code,image_url,has_photos,photo_status";
const MISSING_PHOTO_FILTER = "has_photos.is.false,has_photos.is.null,photo_status.eq.missing_photo,image_url.is.null";

type LocationRow = Record<string, unknown>;
type PhotoResult = { photoUrl?: string; skipped?: boolean; reason?: string };
type LoadLocationsResult = {
  data: LocationRow[] | null;
  error: PostgrestError | null;
  fallbackSelectUsed?: boolean;
  fallbackReason?: string;
};

async function findPhoto(location: LocationRow): Promise<PhotoResult> {
  const key = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!key) return { skipped: true, reason: "GOOGLE_PLACES_API_KEY missing" };
  let placeId = String(location.place_id || location.google_place_id || "");
  if (!placeId) {
    const q = encodeURIComponent([location.name || location.restaurant_name || location.activity_name, location.address, location.city].filter(Boolean).join(" "));
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id&key=${key}`);
    placeId = (await res.json()).candidates?.[0]?.place_id;
  }
  if (!placeId) return { skipped: true, reason: "place_id not found" };
  const details = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${key}`);
  const ref = (await details.json()).result?.photos?.[0]?.photo_reference;
  if (!ref) return { skipped: true, reason: "photo reference not found" };
  return { photoUrl: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${encodeURIComponent(ref)}&key=${key}` };
}

async function loadMissingPhotoLocations(supabase: SupabaseClient, batchSize: number): Promise<LoadLocationsResult> {
  const fullResult = await supabase
    .from("locations")
    .select(FULL_LOCATION_SELECT)
    .or(MISSING_PHOTO_FILTER)
    .limit(batchSize);

  if (!fullResult.error) return fullResult;

  const minimalResult = await supabase
    .from("locations")
    .select(MINIMAL_LOCATION_SELECT)
    .or(MISSING_PHOTO_FILTER)
    .limit(batchSize);

  if (minimalResult.error) return minimalResult;

  return {
    ...minimalResult,
    fallbackSelectUsed: true,
    fallbackReason: fullResult.error.message,
  };
}

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  const startedAt = Date.now();
  const timer = startTimer(); const supabase = createSupabaseAdminClient();
  let source: string | null = null;
  try {
    const auth = await requireAdminOrCron(req, supabase);
    source = auth.source;
    const body = await req.json().catch(() => ({})); const batchSize = Math.min(Math.max(Number(body.batchSize ?? 25), 1), 100); const dryRun = Boolean(body.dryRun);
    const { data: locationRows, error: locationsError, fallbackSelectUsed, fallbackReason } = await loadMissingPhotoLocations(supabase, batchSize);

    if (locationsError) {
      await logEdgeFunctionRun(supabase, {
        function_name: "nightly-photo-backfill",
        status: "error",
        source,
        error_message: locationsError.message,
        duration_ms: Date.now() - startedAt,
        metadata: { stage: "load_locations" }
      });

      return serverError("Failed to load locations for photo backfill", {
        message: locationsError.message,
        details: locationsError
      });
    }

    const locations = Array.isArray(locationRows) ? locationRows : [];
    const debugDetails = dryRun ? {
      queryReturnedArray: Array.isArray(locationRows),
      rawCount: Array.isArray(locationRows) ? locationRows.length : 0,
      locationsPreview: locations.slice(0, 5),
      fallbackSelectUsed: Boolean(fallbackSelectUsed),
      fallbackReason: fallbackReason ?? null,
    } : undefined;

    if (locations.length === 0) {
      if (!dryRun) {
        await supabase.from("cron_job_runs").insert({ job_name: "nightly-photo-backfill", status: "success", finished_at: new Date().toISOString(), duration_ms: timer(), checked_count: 0, success_count: 0, skipped_count: 0, failed_count: 0, success_rate: null, metadata: { dryRun, source } });
        await logEdgeFunctionRun(supabase, { function_name: "nightly-photo-backfill", status: "success", source, duration_ms: timer(), output_summary: { checked: 0, updated: 0, skipped: 0, failed: 0 } });
      }
      return ok({ success: true, checked: 0, updated: 0, skipped: 0, failed: 0, message: "No missing-photo locations found.", ...(dryRun ? { dryRun, debug: debugDetails } : {}) });
    }

    if (dryRun) {
      return ok({ success: true, checked: locations.length, updated: 0, skipped: locations.length, failed: 0, dryRun, wouldCheck: locations, debug: debugDetails });
    }

    let updated = 0, skipped = 0, failed = 0;
    for (const location of locations) {
      try {
        if (hasValidPhoto(location)) {
          skipped++;
          continue;
        }

        const photo = await findPhoto(location);
        if (photo.photoUrl) {
          const { error: updateError } = await supabase.from("locations").update({ image_url: photo.photoUrl, photo_url: photo.photoUrl, has_photos: true, photo_status: "has_photo", updated_at: new Date().toISOString() }).eq("id", location.id);
          if (updateError) {
            failed++;
          } else {
            updated++;
          }
        } else {
          skipped++;
        }
      } catch {
        failed++;
      }
    }
    await supabase.from("cron_job_runs").insert({ job_name: "nightly-photo-backfill", status: failed ? "partial" : "success", finished_at: new Date().toISOString(), duration_ms: timer(), checked_count: locations.length, success_count: updated, skipped_count: skipped, failed_count: failed, success_rate: locations.length ? updated / locations.length : null, metadata: { dryRun, source } });
    await logEdgeFunctionRun(supabase, { function_name: "nightly-photo-backfill", status: "success", source, duration_ms: timer(), output_summary: { checked: locations.length, updated, skipped, failed } });
    return ok({ success: true, checked: locations.length, updated, skipped, failed, dryRun, googlePlacesAvailable: Boolean(Deno.env.get("GOOGLE_PLACES_API_KEY")) });
  } catch (error) { await logEdgeFunctionRun(supabase, { function_name: "nightly-photo-backfill", status: "error", source, error_message: safeError(error), duration_ms: timer() }); return serverError("nightly-photo-backfill failed", safeError(error)); }
});
