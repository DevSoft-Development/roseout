import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminOrCron } from "../_shared/auth.ts";
import { hasValidPhoto } from "../_shared/photos.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";
import type { PostgrestError, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const FULL_LOCATION_SELECT = "id,name,restaurant_name,activity_name,address,city,state,zip_code,image_url,photo_url,has_photos,photo_status,google_place_id,place_id,rating,review_count,is_low_level,quality_status,public_visibility_tier,curation_tier";
const MINIMAL_LOCATION_SELECT = "id,name,address,city,state,zip_code,image_url,has_photos,photo_status";
const MISSING_PHOTO_FILTER = "has_photos.is.false,has_photos.is.null,photo_status.eq.missing_photo,image_url.is.null";

type LocationRow = Record<string, unknown>;
type SkippedPreviewItem = { id: unknown; name: string; reason: string };
type PhotoResult = { photoUrl?: string; skipped?: boolean; reason?: string };
type LoadLocationsResult = {
  data: LocationRow[] | null;
  error: PostgrestError | null;
  fallbackSelectUsed?: boolean;
  fallbackReason?: string;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function locationDisplayName(location: LocationRow): string {
  return String(location.name || location.restaurant_name || location.activity_name || "");
}

function isLikelyChainOrLowPriority(location: LocationRow): boolean {
  const text = [
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.address,
  ].map(normalizeText).join(" ");

  const lowPriorityTerms = [
    "starbucks",
    "burger king",
    "mcdonald",
    "mcdonald's",
    "dunkin",
    "baskin robbins",
    "subway",
    "wendy's",
    "wendys",
    "popeyes",
    "kfc",
    "taco bell",
    "chipotle",
    "domino",
    "domino's",
    "papa john",
    "little caesars",
    "white castle",
    "checkers",
    "five guys",
    "shake shack",
    "ihop",
    "denny",
    "applebee",
    "chili's",
    "olive garden",
    "panera",
    "pret a manger",
    "cvs",
    "walgreens",
    "rite aid",
    "duane reade",
    "target",
    "walmart",
    "costco",
    "gas station",
    "pharmacy",
    "convenience",
    "bodega",
    "deli grocery",
    "smoke shop",
    "liquor store",
  ];

  return lowPriorityTerms.some((term) => text.includes(term));
}

function numericValue(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function truthyPriority(value: unknown): number {
  return value ? 1 : 0;
}

function textPriority(value: unknown, preferred: string[]): number {
  const text = normalizeText(value).replace(/[_-]+/g, " ").trim();
  if (!text) return 0;
  const index = preferred.findIndex((term) => text.includes(term));
  return index === -1 ? 0 : preferred.length - index;
}

function locationPriorityScore(location: LocationRow): number {
  const rating = numericValue(location.rating) ?? 0;
  const reviewCount = numericValue(location.review_count) ?? 0;
  const isLowLevel = location.is_low_level === true ? -1_000_000 : 0;
  const quality = textPriority(location.quality_status, ["publish ready", "standard", "approved", "good"]);
  const visibility = textPriority(location.public_visibility_tier, ["publish ready", "standard", "public"]);
  const curation = textPriority(location.curation_tier, ["publish ready", "standard", "curated"]);
  const hasPlaceId = truthyPriority(location.google_place_id || location.place_id) * 100;

  return isLowLevel + quality * 10_000 + visibility * 5_000 + curation * 5_000 + rating * 100 + Math.min(reviewCount, 10_000) / 100 + hasPlaceId;
}

function sortLocationsForBackfill(locations: LocationRow[]): LocationRow[] {
  return [...locations].sort((a, b) => {
    const chainDelta = Number(isLikelyChainOrLowPriority(a)) - Number(isLikelyChainOrLowPriority(b));
    if (chainDelta !== 0) return chainDelta;

    return locationPriorityScore(b) - locationPriorityScore(a);
  });
}

function makeSkippedPreview(location: LocationRow, reason: string): SkippedPreviewItem {
  return { id: location.id ?? null, name: locationDisplayName(location), reason };
}

function selectLocationsForRun(
  locations: LocationRow[],
  batchSize: number,
  skipChains: boolean,
  includeChains: boolean,
): { selected: LocationRow[]; skipped: number; skippedPreview: SkippedPreviewItem[] } {
  const selected: LocationRow[] = [];
  const skippedPreview: SkippedPreviewItem[] = [];
  let skipped = 0;

  for (const location of locations) {
    if (skipChains && !includeChains && isLikelyChainOrLowPriority(location)) {
      skipped += 1;
      if (skippedPreview.length < 10) skippedPreview.push(makeSkippedPreview(location, "chain_or_low_priority"));
      continue;
    }

    if (selected.length < batchSize) selected.push(location);
    if (selected.length >= batchSize) break;
  }

  return { selected, skipped, skippedPreview };
}

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
  const loadLimit = Math.min(Math.max(batchSize * 4, batchSize), 500);
  const fullResult = await supabase
    .from("locations")
    .select(FULL_LOCATION_SELECT)
    .or(MISSING_PHOTO_FILTER)
    .order("rating", { ascending: false, nullsFirst: false })
    .order("review_count", { ascending: false, nullsFirst: false })
    .order("is_low_level", { ascending: true, nullsFirst: false })
    .order("quality_status", { ascending: true, nullsFirst: false })
    .order("public_visibility_tier", { ascending: true, nullsFirst: false })
    .order("curation_tier", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: true, nullsFirst: false })
    .limit(loadLimit);

  if (!fullResult.error) {
    return { ...fullResult, data: sortLocationsForBackfill(Array.isArray(fullResult.data) ? fullResult.data : []) };
  }

  const minimalResult = await supabase
    .from("locations")
    .select(MINIMAL_LOCATION_SELECT)
    .or(MISSING_PHOTO_FILTER)
    .limit(loadLimit);

  if (minimalResult.error) return minimalResult;

  return {
    ...minimalResult,
    data: sortLocationsForBackfill(Array.isArray(minimalResult.data) ? minimalResult.data : []),
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
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(Number(body.batchSize ?? 25), 1), 100);
    const dryRun = Boolean(body.dryRun);
    const skipChains = body.skipChains === undefined ? true : Boolean(body.skipChains);
    const includeChains = Boolean(body.includeChains);
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

    const loadedLocations = Array.isArray(locationRows) ? locationRows : [];
    const selection = selectLocationsForRun(loadedLocations, batchSize, skipChains, includeChains);
    const locations = selection.selected;
    const locationsPreview = locations.slice(0, 5);
    const skippedPreview = [...selection.skippedPreview];
    const debugDetails = dryRun ? {
      queryReturnedArray: Array.isArray(locationRows),
      rawCount: Array.isArray(locationRows) ? locationRows.length : 0,
      fallbackSelectUsed: Boolean(fallbackSelectUsed),
      fallbackReason: fallbackReason ?? null,
    } : undefined;

    if (loadedLocations.length === 0) {
      if (!dryRun) {
        await supabase.from("cron_job_runs").insert({ job_name: "nightly-photo-backfill", status: "success", finished_at: new Date().toISOString(), duration_ms: timer(), checked_count: 0, success_count: 0, skipped_count: 0, failed_count: 0, success_rate: null, metadata: { dryRun, source, skipChains, includeChains } });
        await logEdgeFunctionRun(supabase, { function_name: "nightly-photo-backfill", status: "success", source, duration_ms: timer(), output_summary: { checked: 0, eligible: 0, updated: 0, skipped: 0, failed: 0 } });
      }
      return ok({ success: true, checked: 0, eligible: 0, updated: 0, skipped: 0, failed: 0, message: "No missing-photo locations found.", ...(dryRun ? { dryRun, skipChains, includeChains, locationsPreview, skippedPreview, debug: debugDetails } : {}) });
    }

    const chainSkipped = selection.skipped;
    const checked = locations.length + chainSkipped;

    if (dryRun) {
      return ok({
        success: true,
        checked,
        eligible: locations.length,
        updated: 0,
        skipped: chainSkipped,
        failed: 0,
        dryRun,
        skipChains,
        includeChains,
        locationsPreview,
        skippedPreview,
        wouldCheck: locations,
        debug: debugDetails,
      });
    }

    let updated = 0, skipped = chainSkipped, failed = 0;
    for (const location of locations) {
      try {
        if (hasValidPhoto(location)) {
          skipped++;
          if (skippedPreview.length < 10) skippedPreview.push(makeSkippedPreview(location, "already_has_photo"));
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
    const eligible = locations.length;
    await supabase.from("cron_job_runs").insert({ job_name: "nightly-photo-backfill", status: failed ? "partial" : "success", finished_at: new Date().toISOString(), duration_ms: timer(), checked_count: checked, success_count: updated, skipped_count: skipped, failed_count: failed, success_rate: checked ? updated / checked : null, metadata: { dryRun, source, skipChains, includeChains } });
    await logEdgeFunctionRun(supabase, { function_name: "nightly-photo-backfill", status: "success", source, duration_ms: timer(), output_summary: { checked, eligible, updated, skipped, failed } });
    return ok({ success: true, checked, eligible, updated, skipped, failed, dryRun, skipChains, includeChains, locationsPreview, skippedPreview, googlePlacesAvailable: Boolean(Deno.env.get("GOOGLE_PLACES_API_KEY")) });
  } catch (error) { await logEdgeFunctionRun(supabase, { function_name: "nightly-photo-backfill", status: "error", source, error_message: safeError(error), duration_ms: timer() }); return serverError("nightly-photo-backfill failed", safeError(error)); }
});
