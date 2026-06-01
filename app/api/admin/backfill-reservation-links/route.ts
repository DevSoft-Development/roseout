import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  detectReservationProvider,
  getGooglePlaceIdFromRow,
  GOOGLE_PLACE_DETAILS_FIELD_MASK,
  normalizeReservationUrl,
  type GooglePlaceDetails,
} from "@/lib/reservation-links";
import { discoverReservationViaProviderSearch } from "@/lib/reservation-provider-search";
import { discoverReservationFromWebsite } from "@/lib/lightweight-reservation-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type BackfillTable = "locations" | "restaurants" | "activities";
type RequestedTable = BackfillTable | "all";
type DiscoveryStatus =
  | "pending"
  | "found"
  | "not_found"
  | "blocked"
  | "failed"
  | "manual";

type BackfillRow = Record<string, unknown> & {
  id?: string | number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  reservation_url?: string | null;
  booking_url?: string | null;
  reservation_link?: string | null;
  reservation_provider?: string | null;
  reservation_source?: string | null;
  reservation_manual_override?: boolean | null;
  reservation_upgrade_opportunity?: boolean | null;
  reservation_upgrade_reason?: string | null;
  reservation_upgrade_detected_at?: string | null;
  reservation_outreach_status?: string | null;
  reservation_outreach_notes?: string | null;
  uses_internal_reservations?: boolean | null;
  internal_reservations_enabled?: boolean | null;
};

type Failure = {
  id: string | number | null;
  name: string | null;
  google_place_id?: string | null;
  status?: number | string;
  error: string;
};

type TableSummary = {
  success: true;
  table: BackfillTable;
  checked: number;
  updated: number;
  foundFromExisting: number;
  foundFromInternal: number;
  foundFromGoogle: number;
  foundFromProviderSearch: number;
  foundFromWebsite: number;
  skippedManualOverride: number;
  skippedAlreadyHasLink: number;
  skippedNoGooglePlaceId: number;
  skippedNoWebsite: number;
  blocked: number;
  notFound: number;
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
    { success: false, error, details, step },
    { status },
  );
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Missing Supabase admin environment variables");
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

async function requireAuthorization(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const xAdminSecret = request.headers.get("x-admin-secret")?.trim() || "";
  const adminSecret = process.env.ADMIN_API_SECRET?.trim();

  const authorized =
    !!adminSecret &&
    (bearerToken === adminSecret || xAdminSecret === adminSecret);

  if (authorized) return null;

  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  if (!error) return null;

  if (!adminSecret) {
    return NextResponse.json(
      {
        success: false,
        error: "Reservation link backfill failed",
        details: "Missing ADMIN_API_SECRET environment variable",
        step: "authorization",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: "Reservation link backfill failed",
      details: "Unauthorized: Admin authorization failed",
      step: "authorization",
      authDebug: {
        hasAuthorizationHeader: !!authHeader,
        hasBearerToken: !!bearerToken,
        hasXAdminSecret: !!xAdminSecret,
        hasAdminSecretEnv: !!adminSecret,
      },
    },
    { status: 401 },
  );
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
    (error.status === 404 ||
      error.googleStatus === "NOT_FOUND" ||
      error.googleStatus === "INVALID_ARGUMENT")
  );
}

async function fetchGoogleDetails(placeId: string) {
  const key = getGoogleKey();
  if (!key) throw new Error("Missing Google Places API key");

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": GOOGLE_PLACE_DETAILS_FIELD_MASK,
      },
    },
  );
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

function booleanValue(value: unknown) {
  return value === true || value === "true";
}

function hasColumn(row: BackfillRow, column: string) {
  return Object.prototype.hasOwnProperty.call(row, column);
}

function addUpdateValue(
  payload: Record<string, unknown>,
  row: BackfillRow,
  column: string,
  value: unknown,
) {
  if (!hasColumn(row, column)) return;
  if (value === undefined || value === "") return;
  payload[column] = value;
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

function existingReservation(row: BackfillRow) {
  return firstExistingString(row, [
    "reservation_url",
    "booking_url",
    "reservation_link",
  ]);
}

function getWebsite(row: BackfillRow, details?: GooglePlaceDetails | null) {
  return stringValue(details?.websiteUri) || stringValue(row.website);
}

function cityState(row: BackfillRow, details?: GooglePlaceDetails | null) {
  const city = stringValue(row.city);
  const state = stringValue(row.state);
  if (city || state || !details?.formattedAddress) return { city, state };
  const parts = details.formattedAddress.split(",").map((part) => part.trim());
  return {
    city: parts.at(-3) || null,
    state: parts.at(-2)?.split(" ")[0] || null,
  };
}

function applyGoogleDetails(
  payload: Record<string, unknown>,
  row: BackfillRow,
  details: GooglePlaceDetails,
) {
  addUpdateValue(payload, row, "website", stringValue(details.websiteUri));
  addUpdateValue(
    payload,
    row,
    "google_maps_url",
    stringValue(details.googleMapsUri),
  );
  addUpdateValue(
    payload,
    row,
    "phone",
    stringValue(details.nationalPhoneNumber) ||
      stringValue(details.internationalPhoneNumber),
  );
}

function applyReservationMatch(
  payload: Record<string, unknown>,
  row: BackfillRow,
  url: string,
  provider: string,
  status: DiscoveryStatus = "found",
) {
  addUpdateValue(payload, row, "reservation_url", url);
  addUpdateValue(payload, row, "booking_url", url);
  addUpdateValue(payload, row, "reservation_link", url);
  addUpdateValue(payload, row, "reservation_provider", provider);
  addUpdateValue(payload, row, "reservation_source", "external");
  addUpdateValue(payload, row, "reservation_upgrade_opportunity", false);
  addUpdateValue(payload, row, "reservation_upgrade_reason", null);
  addUpdateValue(payload, row, "reservation_discovery_status", status);
  addUpdateValue(payload, row, "reservation_discovery_error", null);
  addUpdateValue(
    payload,
    row,
    "reservation_discovered_at",
    new Date().toISOString(),
  );
}

function applyDiscoveryStatus(
  payload: Record<string, unknown>,
  row: BackfillRow,
  status: DiscoveryStatus,
  error?: string,
) {
  addUpdateValue(payload, row, "reservation_discovery_status", status);
  addUpdateValue(payload, row, "reservation_discovery_error", error || null);
}

function touchLastChecked(payload: Record<string, unknown>, row: BackfillRow) {
  addUpdateValue(
    payload,
    row,
    "reservation_last_checked_at",
    new Date().toISOString(),
  );
}

function isInternalReservationSource(row: BackfillRow) {
  const source = stringValue(row.reservation_source)?.toLowerCase();
  return source === "internal" || source === "both";
}

function isReservationUpgradeExcluded(row: BackfillRow) {
  return (
    !!existingReservation(row) ||
    booleanValue(row.internal_reservations_enabled) ||
    booleanValue(row.uses_internal_reservations) ||
    isInternalReservationSource(row) ||
    booleanValue(row.reservation_manual_override)
  );
}

function applyNoReservationOpportunity(
  payload: Record<string, unknown>,
  table: BackfillTable,
  row: BackfillRow,
) {
  if (table !== "locations" || isReservationUpgradeExcluded(row)) return;
  addUpdateValue(payload, row, "reservation_upgrade_opportunity", true);
  addUpdateValue(
    payload,
    row,
    "reservation_upgrade_reason",
    "No external reservation link found",
  );
  addUpdateValue(
    payload,
    row,
    "reservation_upgrade_detected_at",
    new Date().toISOString(),
  );
}

function clearReservationOpportunity(
  payload: Record<string, unknown>,
  row: BackfillRow,
) {
  addUpdateValue(payload, row, "reservation_upgrade_opportunity", false);
  addUpdateValue(payload, row, "reservation_upgrade_reason", null);
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
    foundFromExisting: 0,
    foundFromInternal: 0,
    foundFromGoogle: 0,
    foundFromProviderSearch: 0,
    foundFromWebsite: 0,
    skippedManualOverride: 0,
    skippedAlreadyHasLink: 0,
    skippedNoGooglePlaceId: 0,
    skippedNoWebsite: 0,
    blocked: 0,
    notFound: 0,
    failed: 0,
    failures: [],
    dryRun,
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeUpdate(
  supabaseAdmin: SupabaseClient,
  table: BackfillTable,
  row: BackfillRow,
  payload: Record<string, unknown>,
  dryRun: boolean,
) {
  if (!Object.keys(payload).length) return false;
  if (dryRun) return true;
  const id = getRowId(row);
  if (id === null) throw new Error("Cannot update row without an id");
  await supabaseAdmin.from(table).update(payload).eq("id", id).throwOnError();
  return true;
}

async function processRow(
  supabaseAdmin: SupabaseClient,
  table: BackfillTable,
  row: BackfillRow,
  dryRun: boolean,
  onlyMissing: boolean,
  includeProviderSearch: boolean,
  includeWebsiteDiscovery: boolean,
) {
  const id = getRowId(row);
  const name = getRowName(row);
  const googlePlaceId = getGooglePlaceIdFromRow(row);
  const payload: Record<string, unknown> = {};

  try {
    if (booleanValue(row.reservation_manual_override))
      return { status: "skippedManualOverride" as const };

    const currentReservation = existingReservation(row);
    if (currentReservation) {
      const normalized = normalizeReservationUrl(currentReservation);
      const provider = normalized
        ? detectReservationProvider(normalized)
        : null;
      if (normalized && provider) {
        applyReservationMatch(payload, row, normalized, provider.name, "found");
        touchLastChecked(payload, row);
        await safeUpdate(supabaseAdmin, table, row, payload, dryRun);
        return {
          status: "foundFromExisting" as const,
          updated: Object.keys(payload).length > 0,
        };
      }
      if (onlyMissing) return { status: "skippedAlreadyHasLink" as const };
    }

    if (
      booleanValue(row.internal_reservations_enabled) ||
      booleanValue(row.uses_internal_reservations)
    ) {
      addUpdateValue(
        payload,
        row,
        "reservation_source",
        currentReservation ? "both" : "internal",
      );
      clearReservationOpportunity(payload, row);
      applyDiscoveryStatus(payload, row, "found");
      touchLastChecked(payload, row);
      await safeUpdate(supabaseAdmin, table, row, payload, dryRun);
      return {
        status: "foundFromInternal" as const,
        updated: Object.keys(payload).length > 0,
      };
    }

    let details: GooglePlaceDetails | null = null;
    if (!googlePlaceId) {
      touchLastChecked(payload, row);
    } else {
      try {
        details = await fetchGoogleDetails(googlePlaceId);
        applyGoogleDetails(payload, row, details);
        const googleWebsite = stringValue(details.websiteUri);
        const normalizedGoogleReservation =
          normalizeReservationUrl(googleWebsite);
        if (normalizedGoogleReservation) {
          const provider = detectReservationProvider(
            normalizedGoogleReservation,
          );
          applyReservationMatch(
            payload,
            row,
            normalizedGoogleReservation,
            provider?.name || "Reservation provider",
          );
          touchLastChecked(payload, row);
          await safeUpdate(supabaseAdmin, table, row, payload, dryRun);
          return {
            status: "foundFromGoogle" as const,
            updated: Object.keys(payload).length > 0,
          };
        }
      } catch (error) {
        if (isInvalidPlaceIdError(error)) {
          applyDiscoveryStatus(payload, row, "failed", getErrorMessage(error));
          touchLastChecked(payload, row);
          await safeUpdate(supabaseAdmin, table, row, payload, dryRun);
          return {
            status: "failed" as const,
            failure: {
              id,
              name,
              google_place_id: googlePlaceId,
              status: 404,
              error: getErrorMessage(error),
            } satisfies Failure,
          };
        }
        throw error;
      }
    }

    if (includeProviderSearch && name) {
      const location = cityState(row, details);
      const providerSearch = await discoverReservationViaProviderSearch({
        name,
        city: location.city,
        state: location.state,
      });
      if (providerSearch.best) {
        applyReservationMatch(
          payload,
          row,
          providerSearch.best.url,
          providerSearch.best.provider,
        );
        touchLastChecked(payload, row);
        await safeUpdate(supabaseAdmin, table, row, payload, dryRun);
        return {
          status: "foundFromProviderSearch" as const,
          updated: Object.keys(payload).length > 0,
        };
      }
      const lowConfidence = providerSearch.suggestions[0];
      if (lowConfidence && hasColumn(row, "suggested_reservation_url")) {
        addUpdateValue(
          payload,
          row,
          "suggested_reservation_url",
          lowConfidence.url,
        );
      } else if (lowConfidence) {
        console.info("[backfill-reservation-links] low-confidence suggestion", {
          table,
          id,
          url: lowConfidence.url,
          confidence: lowConfidence.confidence,
        });
      }
    }

    const website = getWebsite(row, details);
    if (includeWebsiteDiscovery && website) {
      const discovery = await discoverReservationFromWebsite(website);
      if (discovery.status === "found" && discovery.match) {
        applyReservationMatch(
          payload,
          row,
          discovery.match.url,
          discovery.match.provider,
        );
        touchLastChecked(payload, row);
        await safeUpdate(supabaseAdmin, table, row, payload, dryRun);
        return {
          status: "foundFromWebsite" as const,
          updated: Object.keys(payload).length > 0,
        };
      }
      if (discovery.status === "blocked") {
        applyDiscoveryStatus(payload, row, "blocked", discovery.error);
        touchLastChecked(payload, row);
        await safeUpdate(supabaseAdmin, table, row, payload, dryRun);
        return {
          status: "blocked" as const,
          updated: Object.keys(payload).length > 0,
          error: discovery.error,
        };
      }
      if (discovery.status === "failed") {
        applyDiscoveryStatus(payload, row, "failed", discovery.error);
        touchLastChecked(payload, row);
        await safeUpdate(supabaseAdmin, table, row, payload, dryRun);
        return {
          status: "failed" as const,
          failure: {
            id,
            name,
            google_place_id: googlePlaceId,
            status: "website",
            error: discovery.error || "Website discovery failed",
          } satisfies Failure,
        };
      }
    } else if (includeWebsiteDiscovery && !website) {
      touchLastChecked(payload, row);
      await safeUpdate(supabaseAdmin, table, row, payload, dryRun);
      return { status: "skippedNoWebsite" as const };
    }

    applyDiscoveryStatus(payload, row, "not_found");
    applyNoReservationOpportunity(payload, table, row);
    touchLastChecked(payload, row);
    await safeUpdate(supabaseAdmin, table, row, payload, dryRun);
    return {
      status: googlePlaceId
        ? ("notFound" as const)
        : ("skippedNoGooglePlaceId" as const),
      updated: Object.keys(payload).length > 0,
    };
  } catch (error) {
    logBackfillError("row", table, id, error);
    return {
      status: "failed" as const,
      failure: {
        id,
        name,
        google_place_id: googlePlaceId,
        status: error instanceof GooglePlaceApiError ? error.status : undefined,
        error: getErrorMessage(error),
      } satisfies Failure,
    };
  }
}

async function runTable(
  supabaseAdmin: SupabaseClient,
  table: BackfillTable,
  limit: number,
  offset: number,
  dryRun: boolean,
  onlyMissing: boolean,
  includeProviderSearch: boolean,
  includeWebsiteDiscovery: boolean,
  rowId: string | null,
  status: string | null,
  lastCheckedBefore: string | null,
) {
  const summary = createTableSummary(table, dryRun);
  const to = offset + limit - 1;
  let query = supabaseAdmin
    .from(table)
    .select("*")
    .order("id", { ascending: true })
    .range(offset, to);

  if (rowId) query = query.eq("id", rowId);
  if (status) query = query.eq("reservation_discovery_status", status);
  if (lastCheckedBefore)
    query = query.or(
      `reservation_last_checked_at.is.null,reservation_last_checked_at.lt.${lastCheckedBefore}`,
    );
  if (onlyMissing)
    query = query.or(
      "reservation_url.is.null,booking_url.is.null,reservation_link.is.null",
    );

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
      includeProviderSearch,
      includeWebsiteDiscovery,
    );

    if ("updated" in result && result.updated) summary.updated += 1;
    if (result.status === "foundFromExisting") summary.foundFromExisting += 1;
    if (result.status === "foundFromInternal") summary.foundFromInternal += 1;
    if (result.status === "foundFromGoogle") summary.foundFromGoogle += 1;
    if (result.status === "foundFromProviderSearch")
      summary.foundFromProviderSearch += 1;
    if (result.status === "foundFromWebsite") summary.foundFromWebsite += 1;
    if (result.status === "skippedManualOverride")
      summary.skippedManualOverride += 1;
    if (result.status === "skippedAlreadyHasLink")
      summary.skippedAlreadyHasLink += 1;
    if (result.status === "skippedNoGooglePlaceId")
      summary.skippedNoGooglePlaceId += 1;
    if (result.status === "skippedNoWebsite") summary.skippedNoWebsite += 1;
    if (result.status === "blocked") summary.blocked += 1;
    if (result.status === "notFound") summary.notFound += 1;
    if (result.status === "failed") {
      summary.failed += 1;
      if (result.failure) summary.failures.push(result.failure);
    }

    if (includeWebsiteDiscovery)
      await sleep(500 + Math.floor(Math.random() * 1000));
  }

  return summary;
}

export async function GET(request: NextRequest) {
  let step = "authorization";
  let requestedTable: RequestedTable = "locations";

  try {
    const authError = await requireAuthorization(request);
    if (authError) return authError;

    step = "supabase-client";
    const supabaseAdmin = getSupabaseAdmin();

    step = "parse-request";
    const { searchParams } = request.nextUrl;
    const limit = Math.max(
      1,
      Math.min(Number(searchParams.get("limit") || 50), 50),
    );
    const offset = Math.max(
      0,
      Number(searchParams.get("offset") || searchParams.get("cursor") || 0),
    );
    const dryRun = searchParams.get("dryRun") !== "false";
    const onlyMissing = searchParams.get("onlyMissing") !== "false";
    const includeProviderSearch =
      searchParams.get("includeProviderSearch") !== "false";
    const includeWebsiteDiscovery =
      searchParams.get("includeWebsiteDiscovery") === "true";
    const rowId = stringValue(searchParams.get("id"));
    const status = stringValue(searchParams.get("status"));
    const lastCheckedBefore = stringValue(
      searchParams.get("lastCheckedBefore"),
    );
    requestedTable = parseRequestedTable(searchParams.get("table"));
    const tables = tablesForRequest(requestedTable);

    const result = {
      success: true,
      table: requestedTable,
      checked: 0,
      updated: 0,
      foundFromExisting: 0,
      foundFromInternal: 0,
      foundFromGoogle: 0,
      foundFromProviderSearch: 0,
      foundFromWebsite: 0,
      skippedManualOverride: 0,
      skippedAlreadyHasLink: 0,
      skippedNoGooglePlaceId: 0,
      skippedNoWebsite: 0,
      blocked: 0,
      notFound: 0,
      failed: 0,
      failures: [] as Failure[],
      dryRun,
      includeProviderSearch,
      includeWebsiteDiscovery,
      limit,
      offset,
      nextOffset: offset + limit,
      tables: {} as Record<BackfillTable, TableSummary>,
    };

    for (const table of tables) {
      step = `run-table:${table}`;
      const tableResult = await runTable(
        supabaseAdmin,
        table,
        limit,
        offset,
        dryRun,
        onlyMissing,
        includeProviderSearch,
        includeWebsiteDiscovery,
        rowId,
        status,
        lastCheckedBefore,
      );
      result.tables[table] = tableResult;
      result.checked += tableResult.checked;
      result.updated += tableResult.updated;
      result.foundFromExisting += tableResult.foundFromExisting;
      result.foundFromInternal += tableResult.foundFromInternal;
      result.foundFromGoogle += tableResult.foundFromGoogle;
      result.foundFromProviderSearch += tableResult.foundFromProviderSearch;
      result.foundFromWebsite += tableResult.foundFromWebsite;
      result.skippedManualOverride += tableResult.skippedManualOverride;
      result.skippedAlreadyHasLink += tableResult.skippedAlreadyHasLink;
      result.skippedNoGooglePlaceId += tableResult.skippedNoGooglePlaceId;
      result.skippedNoWebsite += tableResult.skippedNoWebsite;
      result.blocked += tableResult.blocked;
      result.notFound += tableResult.notFound;
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
