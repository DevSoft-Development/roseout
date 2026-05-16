import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SourceTable = "restaurants" | "activities";
type TableParam = SourceTable | "both";
type SourceRow = Record<string, unknown> & { id: string | number };
type DataStatus =
  | "clean"
  | "missing_image"
  | "missing_coordinates"
  | "missing_address"
  | "needs_review";

type TableSyncResult = {
  checked: number;
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

const RESTAURANT_SELECT = `
  id,
  name,
  restaurant_name,
  primary_category,
  cuisine,
  cuisine_type,
  food_type,
  primary_tag,
  main_image,
  image_url,
  images,
  external_reservation_url,
  reservation_url,
  reservation_link,
  theouthaven_score,
  roseout_score,
  quality_score,
  address,
  city,
  state,
  zip_code,
  neighborhood,
  latitude,
  longitude,
  description,
  price_range,
  rating,
  review_count,
  phone,
  website,
  tags,
  vibe_tags,
  best_for_tags,
  google_types,
  search_keywords,
  review_keywords,
  date_style_tags,
  best_for,
  special_features,
  signature_items,
  popularity_score,
  trend_score,
  conversion_score,
  review_score,
  ranking_badge,
  status,
  is_hidden,
  is_featured,
  is_verified,
  reservation_enabled,
  operating_hours,
  special_hours,
  holiday_closures,
  atmosphere
`;

const ACTIVITY_SELECT = `
  id,
  name,
  activity_name,
  location_type,
  primary_category,
  activity_type,
  primary_tag,
  main_image,
  image_url,
  images,
  external_reservation_url,
  reservation_url,
  reservation_link,
  theouthaven_score,
  roseout_score,
  quality_score,
  address,
  city,
  state,
  zip_code,
  neighborhood,
  latitude,
  longitude,
  description,
  price_range,
  rating,
  review_count,
  phone,
  website,
  tags,
  vibe_tags,
  best_for_tags,
  google_types,
  search_keywords,
  review_keywords,
  date_style_tags,
  best_for,
  special_features,
  signature_items,
  popularity_score,
  trend_score,
  conversion_score,
  review_score,
  ranking_badge,
  status,
  is_hidden,
  is_featured,
  is_verified,
  reservation_enabled,
  operating_hours,
  special_hours,
  holiday_closures,
  atmosphere
`;

const SHARED_FIELDS = [
  "address",
  "city",
  "state",
  "zip_code",
  "neighborhood",
  "latitude",
  "longitude",
  "description",
  "price_range",
  "rating",
  "review_count",
  "phone",
  "website",
  "image_url",
  "images",
  "tags",
  "vibe_tags",
  "best_for_tags",
  "google_types",
  "search_keywords",
  "review_keywords",
  "date_style_tags",
  "best_for",
  "special_features",
  "signature_items",
  "quality_score",
  "popularity_score",
  "trend_score",
  "conversion_score",
  "review_score",
  "ranking_badge",
  "status",
  "is_hidden",
  "is_featured",
  "is_verified",
  "reservation_enabled",
  "operating_hours",
  "special_hours",
  "holiday_closures",
] as const;

const REQUIRED_SEARCH_FIELDS = [
  "name",
  "address",
  "city",
  "state",
  "latitude",
  "longitude",
  "main_image",
] as const;

const TAG_KEYWORDS = [
  "seafood",
  "steakhouse",
  "steak",
  "sushi",
  "italian",
  "mexican",
  "jamaican",
  "caribbean",
  "soul food",
  "brunch",
  "breakfast",
  "dinner",
  "hookah",
  "lounge",
  "rooftop",
  "bar",
  "club",
  "nightlife",
  "bowling",
  "arcade",
  "museum",
  "spa",
  "comedy",
  "karaoke",
  "escape room",
  "paint",
  "art",
  "wine",
  "jazz",
  "live music",
  "romantic",
  "birthday",
  "group",
  "date night",
] as const;

const EMPTY_RESULT: TableSyncResult = {
  checked: 0,
  synced: 0,
  clean: 0,
  needsReview: 0,
  nextOffset: null,
  errors: [],
};

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
      ) || "Restaurant"
    : firstPresent<string>(
        row.primary_category,
        row.activity_type,
        row.primary_tag,
      ) || "Activity";
}

function normalizeArray(value: unknown): string[] {
  if (!isPresent(value)) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeArray(item));
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      normalizeArray(item),
    );
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        return normalizeArray(JSON.parse(trimmed));
      } catch {
        // Fall through to delimiter splitting.
      }
    }

    return trimmed
      .split(/[,|;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [String(value)];
}

function uniqueNormalizedStrings(...values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => normalizeArray(value))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTagsFromName(...values: unknown[]) {
  const text = values
    .flatMap((value) => normalizeArray(value))
    .join(" ")
    .toLowerCase();

  return TAG_KEYWORDS.filter((keyword) =>
    new RegExp(`(^|\\W)${escapeRegExp(keyword)}(\\W|$)`, "i").test(text),
  );
}

function getMainImage(row: SourceRow) {
  return firstPresent<string>(
    row.main_image,
    row.image_url,
    normalizeArray(row.images)[0],
  );
}

function buildTags(table: SourceTable, row: SourceRow) {
  const name = getLocationName(table, row);
  const primaryCategory = getPrimaryCategory(table, row);

  return uniqueNormalizedStrings(
    row.tags,
    extractTagsFromName(
      name,
      primaryCategory,
      row.cuisine,
      row.cuisine_type,
      row.food_type,
      row.activity_type,
      row.primary_tag,
    ),
  );
}

function buildSearchDocument(row: SourceRow, payload: Record<string, unknown>) {
  return uniqueNormalizedStrings(
    payload.name,
    payload.restaurant_name,
    payload.activity_name,
    payload.primary_category,
    row.cuisine,
    row.cuisine_type,
    row.activity_type,
    row.primary_tag,
    payload.tags,
    row.vibe_tags,
    row.best_for_tags,
    row.google_types,
    row.search_keywords,
    row.review_keywords,
    row.date_style_tags,
    row.best_for,
    row.atmosphere,
    row.city,
    row.neighborhood,
    row.state,
    row.description,
  )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMissingFields(payload: Record<string, unknown>) {
  return REQUIRED_SEARCH_FIELDS.filter((field) => !isPresent(payload[field]));
}

function getDataStatus(missingFields: readonly string[]): DataStatus {
  if (missingFields.length === 0) return "clean";
  if (missingFields.includes("main_image")) return "missing_image";
  if (missingFields.includes("latitude") || missingFields.includes("longitude")) {
    return "missing_coordinates";
  }
  if (
    missingFields.includes("address") ||
    missingFields.includes("city") ||
    missingFields.includes("state")
  ) {
    return "missing_address";
  }
  return "needs_review";
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
    0,
  );
}

function buildLocationPayload(table: SourceTable, row: SourceRow) {
  const locationType =
    table === "restaurants"
      ? "restaurant"
      : firstPresent<string>(row.location_type) || "activity";

  const payload: Record<string, unknown> = {
    source_table: table,
    source_id: String(row.id),
    location_type: locationType,
    name: getLocationName(table, row),
    restaurant_name:
      table === "restaurants" ? firstPresent<string>(row.restaurant_name) : null,
    activity_name:
      table === "activities" ? firstPresent<string>(row.activity_name) : null,
    primary_category: getPrimaryCategory(table, row),
    main_image: getMainImage(row),
    external_reservation_url: getReservationUrl(row),
    theouthaven_score: getTheOutHavenScore(row),
    primary_tag: firstPresent<string>(row.primary_tag),
    tags: buildTags(table, row),
    vibe_tags: uniqueNormalizedStrings(row.vibe_tags),
    best_for_tags: uniqueNormalizedStrings(row.best_for_tags),
    google_types: uniqueNormalizedStrings(row.google_types),
    search_keywords: uniqueNormalizedStrings(
      row.search_keywords,
      buildTags(table, row),
    ),
    review_keywords: uniqueNormalizedStrings(row.review_keywords),
    date_style_tags: uniqueNormalizedStrings(row.date_style_tags),
    best_for: uniqueNormalizedStrings(row.best_for),
    special_features: uniqueNormalizedStrings(row.special_features),
    signature_items: uniqueNormalizedStrings(row.signature_items),
    atmosphere: uniqueNormalizedStrings(row.atmosphere),
  };

  if (table === "restaurants") {
    payload.cuisine = firstPresent<string>(row.cuisine);
    payload.cuisine_type = firstPresent<string>(
      row.cuisine_type,
      row.food_type,
    );
  } else {
    payload.activity_type = firstPresent<string>(row.activity_type);
  }

  for (const field of SHARED_FIELDS) {
    if (field in payload) continue;
    const value = row[field];
    payload[field] = Array.isArray(value)
      ? uniqueNormalizedStrings(value)
      : firstPresent(value);
  }

  payload.images = normalizeArray(row.images);
  payload.search_document = buildSearchDocument(row, payload);

  const missingFields = getMissingFields(payload);
  const isSearchable = missingFields.length === 0;

  return {
    ...payload,
    is_searchable: isSearchable,
    data_status: getDataStatus(missingFields),
    missing_fields: missingFields,
    last_quality_check_at: new Date().toISOString(),
  };
}

async function syncTable(
  table: SourceTable,
  limit: number,
  offset: number,
): Promise<TableSyncResult> {
  const select = table === "restaurants" ? RESTAURANT_SELECT : ACTIVITY_SELECT;
  const { data, error } = await (supabaseAdmin as any)
    .from(table)
    .select(select)
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const rows = (data || []) as SourceRow[];
  const result: TableSyncResult = {
    checked: rows.length,
    synced: 0,
    clean: 0,
    needsReview: 0,
    nextOffset: rows.length < limit ? null : offset + limit,
    errors: [],
  };

  for (const row of rows) {
    const payload = buildLocationPayload(table, row);
    const { error: upsertError } = await (supabaseAdmin as any)
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

    const restaurants =
      tableParam === "restaurants" || tableParam === "both"
        ? await syncTable("restaurants", requestedLimit, offset)
        : { ...EMPTY_RESULT };

    const activities =
      tableParam === "activities" || tableParam === "both"
        ? await syncTable("activities", requestedLimit, offset)
        : { ...EMPTY_RESULT };

    return NextResponse.json({
      success: true,
      table: tableParam,
      limit: requestedLimit,
      offset,
      restaurants,
      activities,
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
