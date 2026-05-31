import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { importOsmActivities } from "@/lib/location-growth/osmActivities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;

  const secret = request.headers.get("x-internal-import-secret");
  if (process.env.IMPORT_SECRET && secret === process.env.IMPORT_SECRET) {
    return null;
  }

  const { error } = await requireAdminApiRole(["admin", "superadmin"]);
  return error;
}

function toBoundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.trunc(numeric), min), max);
}

function jsonError(error: unknown, status = 500) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "OSM activities import failed";

  console.error("[location-growth/import-osm-activities]", error);

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status },
  );
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth) return auth;

    const body = await request.json().catch(() => ({}));

    const limit = toBoundedNumber(body.limit, 50, 1, 250);
    const offset = toBoundedNumber(body.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const filterIndex = toBoundedNumber(body.filterIndex, 0, 0, Number.MAX_SAFE_INTEGER);
    const categoryGroup =
      typeof body.categoryGroup === "string" && body.categoryGroup.trim()
        ? body.categoryGroup.trim()
        : "nightlife";

    const result = await importOsmActivities({
      limit,
      offset,
      categoryGroup,
      filterIndex,
    });

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      seen: result.seen,
      mapped: result.mapped,
      staged: result.staged,
      duplicatesRemoved: result.duplicatesRemoved,
      limit: result.limit,
      offset: result.offset,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      categoryGroup: result.categoryGroup,
      filterIndex: result.filterIndex,
      filterLabel: result.filterLabel,
      filterTag: result.filterTag,
      overpassEndpoint: result.overpassEndpoint,
      attemptedEndpoints: result.attemptedEndpoints,
      skippedFilters: result.skippedFilters,
      message: result.message,
    });
  } catch (error) {
    return jsonError(error);
  }
}
