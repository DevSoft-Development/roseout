import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { extractReservationUrl } from "@/lib/reservation-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type BackfillTable = "locations" | "restaurants" | "activities";
type RequestedTable = BackfillTable | "all";

type BackfillRow = Record<string, unknown> & {
  id?: string | number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  google_place_id?: string | null;
  google_id?: string | null;
  place_id?: string | null;
  reservation_url?: string | null;
  booking_url?: string | null;
  reservation_link?: string | null;
  website?: string | null;
  google_maps_url?: string | null;
  phone?: string | null;
  rating?: number | string | null;
};

type GooglePlaceDetails = {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
};

type Failure = {
  id: string | number | null;
  name: string | null;
  error: string;
};

type TableSummary = {
  success: true;
  table: BackfillTable;
  checked: number;
  updated: number;
  skippedAlreadyHasLink: number;
  skippedNoGooglePlaceId: number;
  skippedNoBookingLink: number;
  failed: number;
  failures: Failure[];
  dryRun: boolean;
};

type ErrorResponse = {
  success: false;
  error: string;
  details: string;
  step: string;
};

const GOOGLE_FIELD_MASK = [
  "id",
  "displayName",
  "websiteUri",
  "googleMapsUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "rating",
  "userRatingCount",
  "priceLevel",
].join(",");

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error || "Unknown error");
}

function logBackfillError(
  step: string,
  table: string | null,
  id: string | number | null,
  error: unknown,
) {
  console.error("[backfill-reservation-links]", {
    step,
    table,
    id,
    error: getErrorMessage(error),
  });
}

function jsonError(error: string, details: string, step: string, status = 500) {
  return NextResponse.json<ErrorResponse>(
    {
      success: false,
      error,
      details,
      step,
    },
    { status },
  );
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase admin environment variables");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getGoogleKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    null
  );
}

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
}

function hasSecretAuthorization(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return true;
  const bearer = getBearerToken(request);
  const importSecret = request.headers.get("x-internal-import-secret");

  return Boolean(
    (process.env.ADMIN_SECRET && bearer === process.env.ADMIN_SECRET) ||
    (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) ||
    (process.env.IMPORT_SECRET && importSecret === process.env.IMPORT_SECRET),
  );
}

async function requireAuthorization(request: NextRequest) {
  if (hasSecretAuthorization(request)) return null;
  const { error } = await requireAdminApiRole(["superuser", "admin", "editor"]);
  return error;
}

async function fetchGoogleDetails(placeId: string) {
  const key = getGoogleKey();
  if (!key) throw new Error("Missing Google Places API key");

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
      },
    },
  );

  const text = await response.text();
  const data = text
    ? (JSON.parse(text) as GooglePlaceDetails & {
        error?: { message?: string };
      })
    : null;

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `Google Places error: ${response.status}`,
    );
  }

  if (!data) throw new Error("Google Places returned an empty response");
  return data;
}

function parseRequestedTable(value: string | null): RequestedTable {
  if (value === "restaurants" || value === "activities" || value === "all")
    return value;
  return "locations";
}

function tablesForRequest(table: RequestedTable): BackfillTable[] {
  return table === "all" ? ["locations", "restaurants", "activities"] : [table];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasColumn(row: BackfillRow, column: string) {
  return Object.prototype.hasOwnProperty.call(row, column);
}

function firstExistingString(row: BackfillRow, columns: string[]) {
  for (const column of columns) {
    const value = stringValue(row[column]);
    if (value) return value;
  }
  return null;
}

function getRowId(row: BackfillRow) {
  return typeof row.id === "string" || typeof row.id === "number"
    ? row.id
    : null;
}

function getRowName(row: BackfillRow) {
  return firstExistingString(row, ["name", "restaurant_name", "activity_name"]);
}

function getGooglePlaceId(row: BackfillRow) {
  return firstExistingString(row, ["google_place_id", "google_id", "place_id"]);
}

function existingReservation(row: BackfillRow) {
  return firstExistingString(row, [
    "reservation_url",
    "booking_url",
    "reservation_link",
  ]);
}

function addUpdateValue(
  payload: Record<string, string | number>,
  row: BackfillRow,
  column: string,
  value: string | number | null,
) {
  if (value === null || value === undefined || value === "") return;
  if (!hasColumn(row, column)) return;
  payload[column] = value;
}

function buildUpdatePayload(
  row: BackfillRow,
  details: GooglePlaceDetails,
  reservationUrl: string | null,
) {
  const payload: Record<string, string | number> = {};
  const website = stringValue(details.websiteUri);
  const googleMapsUrl = stringValue(details.googleMapsUri);
  const phone =
    stringValue(details.nationalPhoneNumber) ||
    stringValue(details.internationalPhoneNumber);
  const rating = numberValue(details.rating);

  addUpdateValue(payload, row, "website", website);
  addUpdateValue(payload, row, "google_maps_url", googleMapsUrl);
  addUpdateValue(payload, row, "phone", phone);
  addUpdateValue(payload, row, "rating", rating);

  if (reservationUrl && !existingReservation(row)) {
    addUpdateValue(payload, row, "reservation_url", reservationUrl);
    addUpdateValue(payload, row, "booking_url", reservationUrl);
  }

  return payload;
}

function createTableSummary(
  table: BackfillTable,
  dryRun: boolean,
): TableSummary {
  return {
    success: true,
    table,
    checked: 0,
    updated: 0,
    skippedAlreadyHasLink: 0,
    skippedNoGooglePlaceId: 0,
    skippedNoBookingLink: 0,
    failed: 0,
    failures: [],
    dryRun,
  };
}

async function processRow(
  supabaseAdmin: SupabaseClient,
  table: BackfillTable,
  row: BackfillRow,
  dryRun: boolean,
  onlyMissing: boolean,
  minRating: number | null,
) {
  const id = getRowId(row);
  const name = getRowName(row);

  try {
    const googlePlaceId = getGooglePlaceId(row);

    if (!googlePlaceId) return { status: "skippedNoGooglePlaceId" as const };
    if (onlyMissing && existingReservation(row))
      return { status: "skippedAlreadyHasLink" as const };

    const details = await fetchGoogleDetails(googlePlaceId);
    const rating = numberValue(details.rating) || numberValue(row.rating);
    if (minRating !== null && rating !== null && rating < minRating) {
      return { status: "skippedNoBookingLink" as const };
    }

    const reservationUrl = extractReservationUrl(details);
    if (!reservationUrl) return { status: "skippedNoBookingLink" as const };

    const updatePayload = buildUpdatePayload(row, details, reservationUrl);
    if (Object.keys(updatePayload).length === 0)
      return { status: "skippedNoBookingLink" as const };

    if (!dryRun) {
      if (id === null) throw new Error("Cannot update row without an id");
      await supabaseAdmin
        .from(table)
        .update(updatePayload)
        .eq("id", id)
        .throwOnError();
    }

    return { status: "updated" as const };
  } catch (error) {
    logBackfillError("row", table, id, error);
    return {
      success: false as const,
      error: "Reservation link backfill failed for row",
      details: getErrorMessage(error),
      step: "row",
      id,
      name,
    };
  }
}

async function runTable(
  supabaseAdmin: SupabaseClient,
  table: BackfillTable,
  limit: number,
  dryRun: boolean,
  onlyMissing: boolean,
  minRating: number | null,
) {
  const summary = createTableSummary(table, dryRun);
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("*")
    .limit(limit);

  if (error) throw new Error(error.message);

  for (const row of (data || []) as BackfillRow[]) {
    summary.checked += 1;
    const result = await processRow(
      supabaseAdmin,
      table,
      row,
      dryRun,
      onlyMissing,
      minRating,
    );

    if (result.status === "updated") summary.updated += 1;
    if (result.status === "skippedAlreadyHasLink")
      summary.skippedAlreadyHasLink += 1;
    if (result.status === "skippedNoGooglePlaceId")
      summary.skippedNoGooglePlaceId += 1;
    if (result.status === "skippedNoBookingLink")
      summary.skippedNoBookingLink += 1;
    if ("success" in result && result.success === false) {
      summary.failed += 1;
      summary.failures.push({
        id: result.id,
        name: result.name,
        error: result.details,
      });
    }
  }

  return summary;
}

export async function GET(request: NextRequest) {
  let step = "authorization";
  let requestedTable: RequestedTable = "locations";

  try {
    const authError = await requireAuthorization(request);
    if (authError) {
      return jsonError(
        authError.status === 403 ? "Forbidden" : "Unauthorized",
        authError.statusText || "Admin authorization failed",
        step,
        authError.status || 401,
      );
    }

    step = "google-api-key";
    if (!getGoogleKey())
      return jsonError(
        "Missing Google Places API key",
        "Missing Google Places API key",
        step,
        500,
      );

    step = "supabase-client";
    const supabaseAdmin = getSupabaseAdmin();

    step = "parse-request";
    const { searchParams } = request.nextUrl;
    const limit = Math.max(
      1,
      Math.min(Number(searchParams.get("limit") || 50), 250),
    );
    const dryRun = searchParams.get("dryRun") === "true";
    const onlyMissing = searchParams.get("onlyMissing") !== "false";
    const minRatingParam = searchParams.get("minRating");
    const minRating = minRatingParam ? Number(minRatingParam) : null;
    requestedTable = parseRequestedTable(searchParams.get("table"));
    const tables = tablesForRequest(requestedTable);

    const result = {
      success: true,
      table: requestedTable,
      checked: 0,
      updated: 0,
      skippedAlreadyHasLink: 0,
      skippedNoGooglePlaceId: 0,
      skippedNoBookingLink: 0,
      failed: 0,
      failures: [] as Failure[],
      dryRun,
      tables: {} as Record<BackfillTable, TableSummary>,
    };

    for (const table of tables) {
      step = `run-table:${table}`;
      const tableResult = await runTable(
        supabaseAdmin,
        table,
        limit,
        dryRun,
        onlyMissing,
        minRating,
      );
      result.tables[table] = tableResult;
      result.checked += tableResult.checked;
      result.updated += tableResult.updated;
      result.skippedAlreadyHasLink += tableResult.skippedAlreadyHasLink;
      result.skippedNoGooglePlaceId += tableResult.skippedNoGooglePlaceId;
      result.skippedNoBookingLink += tableResult.skippedNoBookingLink;
      result.failed += tableResult.failed;
      result.failures.push(...tableResult.failures);
    }

    return NextResponse.json(result);
  } catch (error) {
    logBackfillError(step, requestedTable, null, error);
    return jsonError(
      "Reservation link backfill failed",
      getErrorMessage(error),
      step,
      500,
    );
  }
}
