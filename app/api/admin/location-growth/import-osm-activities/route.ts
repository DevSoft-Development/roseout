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

function getCategoryGroup(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "nightlife";
}

function getCursor(body: Record<string, unknown>, categoryGroup: string) {
  const cursor = body.cursor;

  if (cursor && typeof cursor === "object" && !Array.isArray(cursor)) {
    const cursorRecord = cursor as Record<string, unknown>;
    return {
      categoryGroup: getCategoryGroup(cursorRecord.categoryGroup ?? categoryGroup),
      filterIndex: toBoundedNumber(
        cursorRecord.filterIndex,
        0,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      offset: toBoundedNumber(cursorRecord.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    };
  }

  if (body.offset !== undefined) {
    return {
      categoryGroup,
      filterIndex: 0,
      offset: toBoundedNumber(body.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    };
  }

  return {
    categoryGroup,
    filterIndex: 0,
    offset: 0,
  };
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

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const limit = toBoundedNumber(body.limit, 250, 1, 1000);
    const categoryGroup = getCategoryGroup(body.categoryGroup);
    const cursor = getCursor(body, categoryGroup);

    const result = await importOsmActivities({
      limit,
      cursor,
      categoryGroup,
    });

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      seen: result.seen,
      mapped: result.mapped,
      staged: result.staged,
      duplicatesRemoved: result.duplicatesRemoved,
      limit: result.limit,
      categoryGroup: result.categoryGroup,
      filterIndex: result.filterIndex,
      filterLabel: result.filterLabel,
      filterTag: result.filterTag,
      offset: result.offset,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      message: result.message,
    });
  } catch (error) {
    return jsonError(error);
  }
}
