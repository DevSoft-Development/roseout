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

function getOsmLimitCap(categoryGroup: string) {
  if (categoryGroup === "parks") return 10;
  if (categoryGroup === "all") return 10;
  return 100;
}

function normalizeOsmCategoryGroup(categoryGroup: unknown) {
  if (typeof categoryGroup !== "string" || !categoryGroup.trim()) {
    return "nightlife";
  }

  const trimmed = categoryGroup.trim();
  return trimmed === "activities" ? "bowling" : trimmed;
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

    const categoryGroup = normalizeOsmCategoryGroup(body.categoryGroup);
    const maxLimit = getOsmLimitCap(categoryGroup);
    const requestedLimit = Math.min(
      Math.max(Number(body.limit || 25), 1),
      maxLimit,
    );
    const limit = Number.isFinite(requestedLimit)
      ? requestedLimit
      : Math.min(25, maxLimit);
    const offset = toBoundedNumber(body.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const filterIndex = toBoundedNumber(
      body.filterIndex,
      0,
      0,
      Number.MAX_SAFE_INTEGER,
    );

    const result = await importOsmActivities({
      limit,
      offset,
      categoryGroup,
      filterIndex,
    });

    return NextResponse.json({
      ...result,
      maxLimit,
      success: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
