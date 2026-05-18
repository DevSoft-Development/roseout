import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import {
  extractReservationUrl,
  getGooglePlaceIdFromRow,
  GOOGLE_PLACE_DETAILS_FIELD_MASK,
  GOOGLE_TEXT_SEARCH_FIELD_MASK,
  type GooglePlaceDetails,
} from "@/lib/reservation-links";

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
  address?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
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

type Failure = {
  id: string | number | null;
  name: string | null;
  google_place_id?: string | null;
  status?: number;
  error: string;
};

type TableSummary = {
  success: true;
  table: BackfillTable;
  checked: number;
  updated: number;
  skippedAlreadyHasLink: number;
  skippedNoGooglePlaceId: number;
  skippedInvalidPlaceId: number;
  skippedNoBookingLink: number;
  refreshedPlaceIds: number;
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

type GooglePlaceErrorPayload = {
  error?: { code?: number; message?: string; status?: string };
};

type GooglePlaceDetailsResult = {
  details: GooglePlaceDetails;
  placeId: string;
  refreshedPlaceId: boolean;
};

class GooglePlaceApiError extends Error {
  status: number;
  googleStatus?: string;

  constructor(message: string, status: number, googleStatus?: string) {
    super(message);
    this.name = "GooglePlaceApiError";
    this.status = status;
    this.googleStatus = googleStatus;
  }
}

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

function parseGooglePayload(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text) as GooglePlaceDetails & GooglePlaceErrorPayload;
  } catch {
    return null;
  }
}

function isInvalidPlaceIdError(error: unknown) {
  return (
    error instanceof GooglePlaceApiError &&
    (error.status === 404 || error.googleStatus === "NOT_FOUND")
  );
}

async function fetchGoogleDetails(placeId: string) {
  const key = getGoogleKey();
  if (!key) throw new Error("Missing Google Places API key");

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": GOOGLE_PLACE_DETAILS_FIELD_MASK,
    },
  });

  const text = await response.text();
  const data = parseGooglePayload(text);

  if (!response.ok) {
    throw new GooglePlaceApiError(
      data?.error?.message || `Google Places error: ${response.status}`,
      response.status,
      data?.error?.status,
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
  return getGooglePlaceIdFromRow(row);
}

function existingReservation(row: BackfillRow) {
  return firstExistingString(row, [
    "reservation_url",
    "booking_url",
    "reservation_link",
  ]);
}

function getTextSearchQuery(row: BackfillRow) {
  const name = getRowName(row);
  if (!name) return null;

  const address = firstExistingString(row, [
    "address",
    "street_address",
    "formatted_address",
    "formattedAddress",
  ]);
  const city = stringValue(row.city);
  const state = stringValue(row.state);

  if (!address && !city && !state) return null;
  return [name, address, city, state].filter(Boolean).join(" ");
}

async function fetchFreshPlaceFromTextSearch(row: BackfillRow) {
  const key = getGoogleKey();
  if (!key) throw new Error("Missing Google Places API key");

  const textQuery = getTextSearchQuery(row);
  if (!textQuery) return null;

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": GOOGLE_TEXT_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: 1,
    }),
  });

  const text = await response.text();
  const data = text
    ? (JSON.parse(text) as {
        places?: GooglePlaceDetails[];
        error?: { message?: string; status?: string };
      })
    : null;

  if (!response.ok) {
    throw new GooglePlaceApiError(
      data?.error?.message || `Google Places Text Search error: ${response.status}`,
      response.status,
      data?.error?.status,
    );
  }

  return data?.places?.[0] || null;
}

async function fetchDetailsWithFallback(row: BackfillRow, placeId: string) {
  try {
    return {
      details: await fetchGoogleDetails(placeId),
      placeId,
      refreshedPlaceId: false,
    } satisfies GooglePlaceDetailsResult;
  } catch (error) {
    if (!isInvalidPlaceIdError(error)) throw error;

    const freshPlace = await fetchFreshPlaceFromTextSearch(row);
    const freshPlaceId = stringValue(freshPlace?.id);
    if (!freshPlaceId) throw error;

    return {
      details: await fetchGoogleDetails(freshPlaceId),
      placeId: freshPlaceId,
      refreshedPlaceId: true,
    } satisfies GooglePlaceDetailsResult;
  }
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
  freshPlaceId: string | null,
) {
  const payload: Record<string, string | number> = {};
  const website = stringValue(details.websiteUri);
  const googleMapsUrl = stringValue(details.googleMapsUri);
  const phone =
    stringValue(details.nationalPhoneNumber) ||
    stringValue(details.internationalPhoneNumber);
  const rating = numberValue(details.rating);

  addUpdateValue(payload, row, "google_place_id", freshPlaceId);
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
    skippedInvalidPlaceId: 0,
    skippedNoBookingLink: 0,
    refreshedPlaceIds: 0,
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
  const originalGooglePlaceId = getGooglePlaceId(row);

  try {
    if (!originalGooglePlaceId)
      return { status: "skippedNoGooglePlaceId" as const };
    if (onlyMissing && existingReservation(row))
      return { status: "skippedAlreadyHasLink" as const };

    let detailsResult: GooglePlaceDetailsResult;
    try {
      detailsResult = await fetchDetailsWithFallback(row, originalGooglePlaceId);
    } catch (error) {
      if (isInvalidPlaceIdError(error)) {
        return {
          status: "skippedInvalidPlaceId" as const,
          failure: {
            id,
            name,
            google_place_id: originalGooglePlaceId,
            status: 404,
            error: "Invalid or stale Google Place ID",
          } satisfies Failure,
        };
      }
      throw error;
    }

    const rating = numberValue(detailsResult.details.rating) || numberValue(row.rating);
    if (minRating !== null && rating !== null && rating < minRating) {
      return { status: "skippedNoBookingLink" as const };
    }

    const reservationUrl = extractReservationUrl(detailsResult.details);
    if (!reservationUrl) return { status: "skippedNoBookingLink" as const };

    const updatePayload = buildUpdatePayload(
      row,
      detailsResult.details,
      reservationUrl,
      detailsResult.refreshedPlaceId ? detailsResult.placeId : null,
    );
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

    return {
      status: "updated" as const,
      refreshedPlaceId: detailsResult.refreshedPlaceId,
    };
  } catch (error) {
    logBackfillError("row", table, id, error);
    return {
      success: false as const,
      error: "Reservation link backfill failed for row",
      details: getErrorMessage(error),
      step: "row",
      id,
      name,
      google_place_id: originalGooglePlaceId,
      status: error instanceof GooglePlaceApiError ? error.status : undefined,
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
  rowId: string | null,
) {
  const summary = createTableSummary(table, dryRun);
  let query = supabaseAdmin.from(table).select("*").limit(limit);

  if (rowId) query = query.eq("id", rowId);

  const { data, error } = await query;

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

    if (result.status === "updated") {
      summary.updated += 1;
      if (result.refreshedPlaceId) summary.refreshedPlaceIds += 1;
    }
    if (result.status === "skippedAlreadyHasLink")
      summary.skippedAlreadyHasLink += 1;
    if (result.status === "skippedNoGooglePlaceId")
      summary.skippedNoGooglePlaceId += 1;
    if (result.status === "skippedInvalidPlaceId") {
      summary.skippedInvalidPlaceId += 1;
      summary.failures.push(result.failure);
    }
    if (result.status === "skippedNoBookingLink")
      summary.skippedNoBookingLink += 1;
    if ("success" in result && result.success === false) {
      summary.failed += 1;
      summary.failures.push({
        id: result.id,
        name: result.name,
        google_place_id: result.google_place_id,
        status: result.status,
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
        "Reservation link backfill failed",
        `${authError.status === 403 ? "Forbidden" : "Unauthorized"}: ${authError.statusText || "Admin authorization failed"}`,
        step,
        authError.status || 401,
      );
    }

    step = "google-api-key";
    if (!getGoogleKey())
      return jsonError(
        "Reservation link backfill failed",
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
    const parsedMinRating = minRatingParam ? Number(minRatingParam) : null;
    const minRating =
      parsedMinRating !== null && Number.isFinite(parsedMinRating)
        ? parsedMinRating
        : null;
    const rowId = stringValue(searchParams.get("id"));
    requestedTable = parseRequestedTable(searchParams.get("table"));
    const tables = tablesForRequest(requestedTable);

    const result = {
      success: true,
      table: requestedTable,
      checked: 0,
      updated: 0,
      skippedAlreadyHasLink: 0,
      skippedNoGooglePlaceId: 0,
      skippedInvalidPlaceId: 0,
      skippedNoBookingLink: 0,
      refreshedPlaceIds: 0,
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
        rowId,
      );
      result.tables[table] = tableResult;
      result.checked += tableResult.checked;
      result.updated += tableResult.updated;
      result.skippedAlreadyHasLink += tableResult.skippedAlreadyHasLink;
      result.skippedNoGooglePlaceId += tableResult.skippedNoGooglePlaceId;
      result.skippedInvalidPlaceId += tableResult.skippedInvalidPlaceId;
      result.skippedNoBookingLink += tableResult.skippedNoBookingLink;
      result.refreshedPlaceIds += tableResult.refreshedPlaceIds;
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
