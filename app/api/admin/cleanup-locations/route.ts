import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type LocationTable = "restaurants" | "activities";
type DataStatus =
  | "clean"
  | "missing_image"
  | "missing_coordinates"
  | "missing_address"
  | "needs_review";

type LocationRow = Record<string, any> & {
  id: string | number;
  images?: unknown;
};

type CleanupSummary = {
  checked: number;
  clean: number;
  needsReview: number;
  missingImage: number;
  missingCoordinates: number;
  missingAddress: number;
  nextOffset: number | null;
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const INVALID_IMAGES = new Set([
  "",
  "/placeholder.jpg",
  "/no-image.png",
  "/images/placeholder.jpg",
]);

function cleanString(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPresent(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function isValidImage(value: unknown) {
  const image = cleanString(value);
  return Boolean(image && !INVALID_IMAGES.has(image));
}

function getFirstImage(location: LocationRow) {
  if (!Array.isArray(location.images)) return null;

  const [firstImage] = location.images;
  return isValidImage(firstImage) ? cleanString(firstImage) : null;
}

function getLocationName(location: LocationRow) {
  return (
    cleanString(location.name) ||
    cleanString(location.restaurant_name) ||
    cleanString(location.activity_name)
  );
}

function getPrimaryCategory(location: LocationRow) {
  return (
    cleanString(location.primary_category) ||
    cleanString(location.cuisine) ||
    cleanString(location.activity_type) ||
    cleanString(location.primary_tag)
  );
}

function getMainImage(location: LocationRow) {
  return (
    (isValidImage(location.main_image) && cleanString(location.main_image)) ||
    (isValidImage(location.image_url) && cleanString(location.image_url)) ||
    getFirstImage(location)
  );
}

function getMissingFields(location: LocationRow) {
  const missingFields: string[] = [];

  if (!getLocationName(location)) missingFields.push("name");
  if (!getPrimaryCategory(location)) missingFields.push("primary_category");
  if (!isPresent(location.address)) missingFields.push("address");
  if (!isPresent(location.city)) missingFields.push("city");
  if (!isPresent(location.state)) missingFields.push("state");
  if (!isPresent(location.zip_code)) missingFields.push("zip_code");
  if (!isPresent(location.latitude)) missingFields.push("latitude");
  if (!isPresent(location.longitude)) missingFields.push("longitude");
  if (!getMainImage(location)) missingFields.push("main_image");

  return missingFields;
}

function getDataStatus(missingFields: string[]): DataStatus {
  if (missingFields.length === 0) return "clean";
  if (missingFields.includes("main_image")) return "missing_image";

  if (
    missingFields.includes("latitude") ||
    missingFields.includes("longitude")
  ) {
    return "missing_coordinates";
  }

  if (
    missingFields.includes("address") ||
    missingFields.includes("city") ||
    missingFields.includes("state") ||
    missingFields.includes("zip_code")
  ) {
    return "missing_address";
  }

  return "needs_review";
}

function calculateQualityScore(location: LocationRow) {
  let score = 0;

  if (getLocationName(location)) score += 20;
  if (getPrimaryCategory(location)) score += 15;
  if (isPresent(location.address)) score += 10;
  if (isPresent(location.city)) score += 5;
  if (isPresent(location.state)) score += 5;
  if (isPresent(location.zip_code)) score += 5;
  if (isPresent(location.latitude) && isPresent(location.longitude)) score += 15;
  if (getMainImage(location)) score += 15;
  if (isPresent(location.description) || isPresent(location.short_description)) {
    score += 10;
  }

  return Math.min(100, Math.round(score));
}

function buildBackfillUpdates(location: LocationRow) {
  const updates: Record<string, unknown> = {};
  const locationName = getLocationName(location);
  const primaryCategory = getPrimaryCategory(location);
  const mainImage = getMainImage(location);
  const reservationUrl =
    cleanString(location.reservation_url) || cleanString(location.reservation_link);
  const googleMapsUrl = cleanString(location.google_maps_link);

  if (!cleanString(location.name) && locationName) {
    updates.name = locationName;
  }

  if (!isValidImage(location.main_image) && mainImage) {
    updates.main_image = mainImage;
  }

  if (!cleanString(location.primary_category) && primaryCategory) {
    updates.primary_category = primaryCategory;
  }

  if (!cleanString(location.external_reservation_url) && reservationUrl) {
    updates.external_reservation_url = reservationUrl;
  }

  if (!cleanString(location.google_maps_url) && googleMapsUrl) {
    updates.google_maps_url = googleMapsUrl;
  }

  if (!isPresent(location.theouthaven_score) && isPresent(location.roseout_score)) {
    updates.theouthaven_score = Number(location.roseout_score);
  }

  return updates;
}

function createEmptySummary(nextOffset: number | null = null): CleanupSummary {
  return {
    checked: 0,
    clean: 0,
    needsReview: 0,
    missingImage: 0,
    missingCoordinates: 0,
    missingAddress: 0,
    nextOffset,
  };
}

function incrementSummary(summary: CleanupSummary, dataStatus: DataStatus) {
  if (dataStatus === "clean") summary.clean += 1;
  if (dataStatus === "needs_review") summary.needsReview += 1;
  if (dataStatus === "missing_image") summary.missingImage += 1;
  if (dataStatus === "missing_coordinates") summary.missingCoordinates += 1;
  if (dataStatus === "missing_address") summary.missingAddress += 1;
}

function mergeSummaries(summaries: CleanupSummary[]): CleanupSummary {
  const nextOffsets = summaries
    .map((summary) => summary.nextOffset)
    .filter((nextOffset): nextOffset is number => nextOffset !== null);

  return summaries.reduce(
    (total, summary) => ({
      checked: total.checked + summary.checked,
      clean: total.clean + summary.clean,
      needsReview: total.needsReview + summary.needsReview,
      missingImage: total.missingImage + summary.missingImage,
      missingCoordinates: total.missingCoordinates + summary.missingCoordinates,
      missingAddress: total.missingAddress + summary.missingAddress,
      nextOffset: nextOffsets.length > 0 ? Math.max(...nextOffsets) : null,
    }),
    createEmptySummary(),
  );
}

function parseBatchParam(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function isValidTableParam(
  tableParam: string,
): tableParam is LocationTable | "both" {
  return tableParam === "restaurants" || tableParam === "activities" || tableParam === "both";
}

async function processTable(
  table: LocationTable,
  limit: number,
  offset: number,
) {
  const from = offset;
  const to = offset + limit - 1;

  const { data, error } = await supabaseAdmin
    .from(table)
    .select("*")
    .range(from, to);

  if (error) throw error;

  const summary = createEmptySummary();
  const errors: Array<{ id: LocationRow["id"]; message: string }> = [];

  for (const location of (data || []) as LocationRow[]) {
    const missingFields = getMissingFields(location);
    const isSearchable = missingFields.length === 0;
    const dataStatus = getDataStatus(missingFields);
    const qualityScore = calculateQualityScore(location);

    const updates = {
      ...buildBackfillUpdates(location),
      is_searchable: isSearchable,
      data_status: isSearchable ? "clean" : dataStatus,
      missing_fields: missingFields,
      quality_score: qualityScore,
      last_quality_check_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from(table)
      .update(updates)
      .eq("id", location.id);

    summary.checked += 1;
    incrementSummary(summary, dataStatus);

    if (updateError) {
      console.error(`${table} update error`, location.id, updateError);
      errors.push({ id: location.id, message: updateError.message });
    }
  }

  summary.nextOffset = (data?.length || 0) < limit ? null : offset + limit;

  return {
    table,
    ...summary,
    errors,
  };
}

export async function GET(req: NextRequest) {
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

    const tableResults = [];

    if (tableParam === "restaurants" || tableParam === "both") {
      tableResults.push(await processTable("restaurants", requestedLimit, offset));
    }

    if (tableParam === "activities" || tableParam === "both") {
      tableResults.push(await processTable("activities", requestedLimit, offset));
    }

    const summary = mergeSummaries(tableResults);
    const resultsByTable = Object.fromEntries(
      tableResults.map((result) => [result.table, result]),
    );

    return NextResponse.json({
      success: true,
      table: tableParam,
      limit: requestedLimit,
      offset,
      ...summary,
      ...resultsByTable,
      results: tableResults,
    });
  } catch (error: any) {
    console.error("cleanup-locations error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Cleanup failed.",
      },
      { status: 500 },
    );
  }
}
