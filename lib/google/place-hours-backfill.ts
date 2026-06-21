import { supabaseAdmin } from "@/lib/supabase-admin";

const HOURS_FIELD_MASK = "id,currentOpeningHours,regularOpeningHours,utcOffsetMinutes";
const RETRYABLE_STATUSES = new Set(["not_started", "failed", "retry_later", "skipped_missing_place_id"]);

type BackfillRow = {
  id: string;
  google_place_id?: string | null;
};

type BackfillOptions = {
  limit?: number;
  batchSize?: number;
  sleepMs?: number;
};

function googlePlacesApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
}

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(value: unknown) {
  return RETRYABLE_STATUSES.has(String(value || "not_started"));
}

async function fetchPlaceHours(placeId: string) {
  const key = googlePlacesApiKey();
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY");
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": HOURS_FIELD_MASK,
    },
  });
  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) {
    const error = new Error(String((body as any)?.error?.message || `Google Place Details hours failed: ${response.status}`));
    (error as any).status = response.status;
    throw error;
  }
  return body as Record<string, unknown>;
}

async function updateSkippedMissingPlaceId(id: string) {
  await supabaseAdmin.from("locations").update({
    hours_backfill_status: "skipped_missing_place_id",
    hours_backfill_error: null,
    hours_last_backfilled_at: new Date().toISOString(),
  }).eq("id", id);
}

async function updateSuccess(id: string, details: Record<string, unknown>) {
  await supabaseAdmin.from("locations").update({
    google_current_opening_hours: details.currentOpeningHours ?? null,
    google_regular_opening_hours: details.regularOpeningHours ?? null,
    google_utc_offset_minutes: typeof details.utcOffsetMinutes === "number" ? details.utcOffsetMinutes : null,
    hours_raw: details,
    hours_source: "google_places_details",
    hours_confidence: details.currentOpeningHours || details.regularOpeningHours ? "verified" : "unknown",
    hours_backfill_status: "success",
    hours_backfill_error: null,
    hours_last_backfilled_at: new Date().toISOString(),
  }).eq("id", id);
}

async function updateFailure(id: string, error: unknown) {
  const statusCode = Number((error as any)?.status);
  const status = statusCode === 429 || statusCode >= 500 ? "retry_later" : "failed";
  await supabaseAdmin.from("locations").update({
    hours_backfill_status: status,
    hours_backfill_error: error instanceof Error ? error.message : String(error),
    hours_last_backfilled_at: new Date().toISOString(),
  }).eq("id", id);
  return status;
}

export async function runLocationHoursBackfill(options: BackfillOptions = {}) {
  const maxPerRun = parsePositiveInt(process.env.HOURS_BACKFILL_MAX_PER_RUN, 500, 1, 1000);
  const requestedLimit = parsePositiveInt(options.limit ?? process.env.HOURS_BACKFILL_LIMIT, 250, 1, maxPerRun);
  const limit = Math.min(requestedLimit, maxPerRun);
  const batchSize = parsePositiveInt(options.batchSize ?? process.env.HOURS_BACKFILL_BATCH_SIZE, 25, 1, 100);
  const sleepMs = parsePositiveInt(options.sleepMs ?? process.env.HOURS_BACKFILL_SLEEP_MS, 250, 0, 5000);
  const staleBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const started = Date.now();
  const errors: Array<{ id: string; error: string }> = [];
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let retryLater = 0;

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, google_place_id, hours_backfill_status, hours_last_backfilled_at")
    .eq("is_searchable", true)
    .or(`hours_last_backfilled_at.is.null,hours_last_backfilled_at.lt.${staleBefore},hours_backfill_status.in.(not_started,failed,retry_later,skipped_missing_place_id)`)
    .order("hours_last_backfilled_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as Array<BackfillRow & { hours_backfill_status?: string | null; hours_last_backfilled_at?: string | null }>).filter((row) => {
    if (!row.hours_last_backfilled_at) return true;
    if (new Date(row.hours_last_backfilled_at).toISOString() < staleBefore) return true;
    return isRetryableStatus(row.hours_backfill_status);
  });

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    for (const row of batch) {
      processed += 1;
      try {
        if (!row.google_place_id) {
          await updateSkippedMissingPlaceId(row.id);
          skipped += 1;
          continue;
        }
        const details = await fetchPlaceHours(row.google_place_id);
        await updateSuccess(row.id, details);
        updated += 1;
      } catch (err) {
        const status = await updateFailure(row.id, err);
        if (status === "retry_later") retryLater += 1;
        else failed += 1;
        if (errors.length < 10) errors.push({ id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
      if (sleepMs > 0) await sleep(sleepMs);
    }
  }

  return { success: failed === 0, requestedLimit, processed, updated, skipped, failed, retryLater, errors, durationMs: Date.now() - started };
}
