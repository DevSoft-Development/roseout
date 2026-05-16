import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SourceTable = "restaurants" | "activities";
type TableParam = SourceTable | "both";
type SourceRow = Record<string, unknown> & { id: string | number };

type SyncSummary = {
  restaurantsSynced: number;
  activitiesSynced: number;
  clean: number;
  needsReview: number;
  nextOffset: number | null;
  nextOffsets: Partial<Record<SourceTable, number | null>>;
};

type TableSyncResult = {
  table: SourceTable;
  synced: number;
  clean: number;
  needsReview: number;
  nextOffset: number | null;
  errors: Array<{ id: SourceRow["id"]; message: string }>;
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const REQUIRED_SEARCH_FIELDS = [
  "name",
  "address",
  "city",
  "state",
  "latitude",
  "longitude",
  "main_image",
] as const;

function cleanString(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstPresent<T = unknown>(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = cleanString(value);
      if (trimmed) return trimmed as T;
      continue;
    }

    if (value !== null && value !== undefined) return value as T;
  }

  return null;
}

function isPresent(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function parseBatchParam(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function isValidTableParam(table: string): table is TableParam {
  return table === "restaurants" || table === "activities" || table === "both";
}

function getLocationName(table: SourceTable, row: SourceRow) {
  return table === "restaurants"
    ? firstPresent<string>(row.name, row.restaurant_name)
    : firstPresent<string>(row.name, row.activity_name);
}

function getPrimaryCategory(table: SourceTable, row: SourceRow) {
  return table === "restaurants"
    ? firstPresent<string>(
        row.primary_category,
        row.cuisine,
        row.cuisine_type,
        row.food_type,
        row.primary_tag,
      ) || "Experience"
    : firstPresent<string>(
        row.primary_category,
        row.activity_type,
        row.primary_tag,
      ) || "Experience";
}

function getMainImage(row: SourceRow) {
  return firstPresent<string>(row.main_image, row.image_url);
}

function getReservationUrl(row: SourceRow) {
  return firstPresent<string>(
    row.external_reservation_url,
    row.reservation_url,
    row.reservation_link,
  );
}

function getTheOutHavenScore(row: SourceRow) {
  return firstPresent<number | string>(
    row.theouthaven_score,
    row.roseout_score,
    row.quality_score,
  );
}

function getMissingFields(payload: Record<string, unknown>) {
  return REQUIRED_SEARCH_FIELDS.filter((field) => !isPresent(payload[field]));
}

function buildLocationPayload(table: SourceTable, row: SourceRow) {
  const locationType = table === "restaurants" ? "restaurant" : "activity";
  const name = getLocationName(table, row);
  const primaryCategory = getPrimaryCategory(table, row);
  const mainImage = getMainImage(row);
  const externalReservationUrl = getReservationUrl(row);
  const theOutHavenScore = getTheOutHavenScore(row);

  const payload: Record<string, unknown> = {
    source_table: table,
    source_id: row.id,
    location_type: locationType,
    name,
    primary_category: primaryCategory,
    main_image: mainImage,
    external_reservation_url: externalReservationUrl,
    theouthaven_score: theOutHavenScore,
    address: firstPresent<string>(row.address),
    city: firstPresent<string>(row.city),
    state: firstPresent<string>(row.state),
    zip_code: firstPresent<string>(row.zip_code),
    latitude: firstPresent<number | string>(row.latitude),
    longitude: firstPresent<number | string>(row.longitude),
    neighborhood: firstPresent<string>(row.neighborhood),
    description: firstPresent<string>(row.description, row.short_description),
    price_range: firstPresent<string>(row.price_range),
    rating: firstPresent<number | string>(row.rating),
    review_count: firstPresent<number | string>(row.review_count),
    phone: firstPresent<string>(row.phone),
    website: firstPresent<string>(row.website),
    image_url: firstPresent<string>(row.image_url),
    reservation_url: firstPresent<string>(row.reservation_url),
    reservation_link: firstPresent<string>(row.reservation_link),
    status: firstPresent<string>(row.status),
  };

  const missingFields = getMissingFields(payload);
  const isSearchable = missingFields.length === 0;

  return {
    ...payload,
    is_searchable: isSearchable,
    data_status: isSearchable ? "clean" : "needs_review",
    missing_fields: missingFields,
    last_quality_check_at: new Date().toISOString(),
  };
}

async function syncTable(
  table: SourceTable,
  limit: number,
  offset: number,
): Promise<TableSyncResult> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("*")
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const rows = (data || []) as SourceRow[];
  const result: TableSyncResult = {
    table,
    synced: 0,
    clean: 0,
    needsReview: 0,
    nextOffset: rows.length < limit ? null : offset + limit,
    errors: [],
  };

  for (const row of rows) {
    const payload = buildLocationPayload(table, row);
    const { error: upsertError } = await supabaseAdmin
      .from("locations")
      .upsert(payload, { onConflict: "source_table,source_id" });

    if (upsertError) {
      console.error("sync-locations upsert error", table, row.id, upsertError);
      result.errors.push({ id: row.id, message: upsertError.message });
      continue;
    }

    result.synced += 1;

    if (payload.is_searchable) {
      result.clean += 1;
    } else {
      result.needsReview += 1;
    }
  }

  return result;
}

function mergeResults(results: TableSyncResult[]): SyncSummary {
  const nextOffsets = Object.fromEntries(
    results.map((result) => [result.table, result.nextOffset]),
  ) as Partial<Record<SourceTable, number | null>>;
  const offsetValues = results
    .map((result) => result.nextOffset)
    .filter((nextOffset): nextOffset is number => nextOffset !== null);

  const initialSummary: SyncSummary = {
    restaurantsSynced: 0,
    activitiesSynced: 0,
    clean: 0,
    needsReview: 0,
    nextOffset: null,
    nextOffsets,
  };

  return results.reduce<SyncSummary>(
    (summary, result) => ({
      restaurantsSynced:
        summary.restaurantsSynced +
        (result.table === "restaurants" ? result.synced : 0),
      activitiesSynced:
        summary.activitiesSynced +
        (result.table === "activities" ? result.synced : 0),
      clean: summary.clean + result.clean,
      needsReview: summary.needsReview + result.needsReview,
      nextOffset: offsetValues.length > 0 ? Math.max(...offsetValues) : null,
      nextOffsets,
    }),
    initialSummary,
  );
}

async function runSync(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tableParam = url.searchParams.get("table") || "both";
    const requestedLimit = parseBatchParam(
      url.searchParams.get("limit"),
      DEFAULT_LIMIT,
    );
    const offset = parseBatchParam(url.searchParams.get("offset"), 0);

    if (!isValidTableParam(tableParam)) {
      return NextResponse.json(
        { success: false, error: "Invalid table parameter." },
        { status: 400 },
      );
    }

    if (requestedLimit < 1 || requestedLimit > MAX_LIMIT) {
      return NextResponse.json(
        {
          success: false,
          error: `Limit must be between 1 and ${MAX_LIMIT}.`,
        },
        { status: 400 },
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { success: false, error: "Offset must be 0 or greater." },
        { status: 400 },
      );
    }

    const results: TableSyncResult[] = [];

    if (tableParam === "restaurants" || tableParam === "both") {
      results.push(await syncTable("restaurants", requestedLimit, offset));
    }

    if (tableParam === "activities" || tableParam === "both") {
      results.push(await syncTable("activities", requestedLimit, offset));
    }

    return NextResponse.json({
      success: true,
      table: tableParam,
      limit: requestedLimit,
      offset,
      ...mergeResults(results),
      results,
    });
  } catch (error: unknown) {
    console.error("sync-locations error:", error);
    const message =
      error instanceof Error ? error.message : "Location sync failed.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return runSync(req);
}

export async function POST(req: NextRequest) {
  return runSync(req);
}
