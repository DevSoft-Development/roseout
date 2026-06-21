import { supabaseAdmin } from "@/lib/supabase-admin";

const HOURS_FIELD_MASK = "id,currentOpeningHours,regularOpeningHours,utcOffsetMinutes";
const RETRYABLE_STATUSES = new Set(["not_started", "failed", "retry_later", "skipped_missing_place_id"]);

type BackfillRow = {
  id: string;
  google_place_id?: string | null;
  operating_hours?: unknown;
  special_hours?: unknown;
  google_regular_opening_hours?: unknown;
  hours_raw?: unknown;
};

type BackfillOptions = {
  limit?: number;
  batchSize?: number;
  sleepMs?: number;
  repairOperatingHours?: boolean;
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

const GOOGLE_DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

type GoogleTimePoint = {
  day?: number;
  hour?: number;
  minute?: number;
  date?: { year?: number; month?: number; day?: number };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asGoogleTimePoint(value: unknown): GoogleTimePoint | undefined {
  const record = asRecord(value);
  return record ? record as GoogleTimePoint : undefined;
}

const FAKE_HOURS_PLACEHOLDERS = new Set([
  JSON.stringify({ monday: "9am-5pm" }),
  JSON.stringify({ Monday: "9am-5pm" }),
]);

function stableJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return JSON.stringify(Object.keys(record).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = record[key];
    return acc;
  }, {}));
}

function isFakeHoursPlaceholder(value: unknown): boolean {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === '{"monday":"9am-5pm"}' || trimmed === '{"Monday":"9am-5pm"}') return true;
    try {
      return isFakeHoursPlaceholder(JSON.parse(trimmed));
    } catch {
      return false;
    }
  }
  return stableJson(value) ? FAKE_HOURS_PLACEHOLDERS.has(stableJson(value)!) : false;
}

function isBlankHoursValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "null" || trimmed === "{}" || trimmed === "[]") return true;
    return isFakeHoursPlaceholder(trimmed);
  }
  if (Array.isArray(value)) return value.length === 0 || value.every(isBlankHoursValue);
  if (typeof value === "object") {
    if (isFakeHoursPlaceholder(value)) return true;
    const entries = Object.values(value as Record<string, unknown>);
    return entries.length === 0 || entries.every(isBlankHoursValue);
  }
  return false;
}

function normalizeHoursText(value: string) {
  return value
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s*[–—-]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReadableTime(hour: number, minute: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatGoogleTimePoint(point: GoogleTimePoint | undefined) {
  if (!point) return null;
  const hour = typeof point.hour === "number" ? point.hour : 0;
  const minute = typeof point.minute === "number" ? point.minute : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatGoogleDate(date: GoogleTimePoint["date"]) {
  if (!date || typeof date.year !== "number" || typeof date.month !== "number" || typeof date.day !== "number") return null;
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function normalizeGoogleRegularOpeningHours(regularOpeningHours: unknown) {
  const record = asRecord(regularOpeningHours);
  if (!record) return null;

  const weekdayDescriptions = Array.isArray(record.weekdayDescriptions)
    ? record.weekdayDescriptions
    : Array.isArray(record.weekday_descriptions)
      ? record.weekday_descriptions
      : null;

  if (weekdayDescriptions?.length) {
    const normalized: Record<string, string[]> = {};
    for (const item of weekdayDescriptions) {
      const description = normalizeHoursText(String(item || ""));
      const match = description.match(/^([^:]+):\s*(.+)$/);
      if (!match) continue;
      const dayKey = match[1].trim().toLowerCase();
      if (!GOOGLE_DAY_KEYS.includes(dayKey)) continue;
      const hoursText = normalizeHoursText(match[2]);
      normalized[dayKey] = hoursText ? [hoursText] : [];
    }
    return Object.keys(normalized).length > 0 ? normalized : null;
  }

  const periods = record.periods;
  if (!Array.isArray(periods) || periods.length === 0) return null;

  const normalized = Object.fromEntries(GOOGLE_DAY_KEYS.map((day) => [day, [] as string[]]));

  for (const period of periods) {
    if (!period || typeof period !== "object") continue;
    const periodRecord = asRecord(period);
    const openPoint = asGoogleTimePoint(periodRecord?.open);
    const closePoint = asGoogleTimePoint(periodRecord?.close);
    const day = typeof openPoint?.day === "number" ? GOOGLE_DAY_KEYS[openPoint.day] : undefined;
    const openHour = typeof openPoint?.hour === "number" ? openPoint.hour : 0;
    const openMinute = typeof openPoint?.minute === "number" ? openPoint.minute : 0;
    const closeHour = typeof closePoint?.hour === "number" ? closePoint.hour : 0;
    const closeMinute = typeof closePoint?.minute === "number" ? closePoint.minute : 0;
    if (!day || openHour < 0 || openHour > 23 || openMinute < 0 || openMinute > 59 || closeHour < 0 || closeHour > 23 || closeMinute < 0 || closeMinute > 59) continue;
    normalized[day].push(`${formatReadableTime(openHour, openMinute)} - ${formatReadableTime(closeHour, closeMinute)}`);
  }

  return Object.values(normalized).some((windows) => windows.length > 0) ? normalized : null;
}

function normalizeGoogleSpecialOpeningHours(currentOpeningHours: unknown) {
  if (!currentOpeningHours || typeof currentOpeningHours !== "object") return null;
  const record = asRecord(currentOpeningHours);
  if (!record) return null;
  const specialDays = Array.isArray(record.specialDays) ? record.specialDays : [];
  const exceptionalDates = new Set(
    specialDays
      .map((day) => asRecord(day))
      .filter((day): day is Record<string, unknown> => day !== null && day.exceptionalHours === true)
      .map((day) => formatGoogleDate(asGoogleTimePoint(day)?.date))
      .filter((date): date is string => Boolean(date))
  );
  if (exceptionalDates.size === 0) return null;

  const specialHours: Record<string, unknown> = Object.fromEntries(
    Array.from(exceptionalDates).map((date) => [date, { closed: true }])
  );
  const periods = Array.isArray(record.periods) ? record.periods : [];

  for (const period of periods) {
    if (!period || typeof period !== "object") continue;
    const periodRecord = asRecord(period);
    const openPoint = asGoogleTimePoint(periodRecord?.open);
    const closePoint = asGoogleTimePoint(periodRecord?.close);
    const date = formatGoogleDate(openPoint?.date);
    const open = formatGoogleTimePoint(openPoint);
    const close = formatGoogleTimePoint(closePoint);
    if (!date || !exceptionalDates.has(date) || !open || !close) continue;
    const existing = specialHours[date];
    const windows = Array.isArray(existing) ? existing : [];
    specialHours[date] = [...windows, { open, close }];
  }

  return Object.keys(specialHours).length > 0 ? specialHours : null;
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

async function updateSuccess(row: BackfillRow, details: Record<string, unknown>) {
  const regularOpeningHours = details.regularOpeningHours ?? details.regular_opening_hours ?? null;
  const currentOpeningHours = details.currentOpeningHours ?? details.current_opening_hours ?? null;
  const normalizedOperatingHours = normalizeGoogleRegularOpeningHours(regularOpeningHours);
  const normalizedSpecialHours = normalizeGoogleSpecialOpeningHours(currentOpeningHours);
  const update: Record<string, unknown> = {
    google_current_opening_hours: currentOpeningHours,
    google_regular_opening_hours: regularOpeningHours,
    google_utc_offset_minutes: typeof details.utcOffsetMinutes === "number" ? details.utcOffsetMinutes : null,
    hours_raw: details,
    hours_source: "google_places_details",
    hours_confidence: currentOpeningHours || regularOpeningHours ? "verified" : "unknown",
    hours_backfill_status: "success",
    hours_backfill_error: null,
    hours_last_backfilled_at: new Date().toISOString(),
  };

  if (isBlankHoursValue(row.operating_hours) && normalizedOperatingHours) {
    update.operating_hours = normalizedOperatingHours;
  }

  if (isBlankHoursValue(row.special_hours) && normalizedSpecialHours) {
    update.special_hours = normalizedSpecialHours;
  }

  await supabaseAdmin.from("locations").update(update).eq("id", row.id);
}

async function repairOperatingHoursFromGoogle(limit: number) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, operating_hours, google_regular_opening_hours, hours_raw")
    .not("google_regular_opening_hours", "is", null)
    .eq("hours_backfill_status", "success")
    .order("hours_last_backfilled_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  let repaired = 0;
  let skipped = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const row of (data ?? []) as BackfillRow[]) {
    if (!isBlankHoursValue(row.operating_hours)) {
      skipped += 1;
      continue;
    }
    const raw = asRecord(row.hours_raw);
    const regularOpeningHours = row.google_regular_opening_hours ?? raw?.regularOpeningHours ?? raw?.regular_opening_hours ?? null;
    const normalized = normalizeGoogleRegularOpeningHours(regularOpeningHours);
    if (!normalized) {
      skipped += 1;
      continue;
    }
    const { error: updateError } = await supabaseAdmin
      .from("locations")
      .update({ operating_hours: normalized, hours_last_backfilled_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updateError) {
      if (errors.length < 10) errors.push({ id: row.id, error: updateError.message });
    } else {
      repaired += 1;
    }
  }

  return { repaired, repairSkipped: skipped, repairErrors: errors };
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
  let repaired = 0;
  let repairSkipped = 0;
  const repairErrors: Array<{ id: string; error: string }> = [];

  if (options.repairOperatingHours) {
    const repair = await repairOperatingHoursFromGoogle(limit);
    repaired = repair.repaired;
    repairSkipped = repair.repairSkipped;
    repairErrors.push(...repair.repairErrors);
  }

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, google_place_id, operating_hours, special_hours, google_regular_opening_hours, hours_raw, hours_backfill_status, hours_last_backfilled_at")
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
        await updateSuccess(row, details);
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

  return { success: failed === 0 && repairErrors.length === 0, requestedLimit, processed, updated, skipped, failed, retryLater, repaired, repairSkipped, repairErrors, errors, durationMs: Date.now() - started };
}
