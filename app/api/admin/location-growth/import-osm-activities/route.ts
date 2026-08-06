import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { importOsmActivities } from "@/lib/location-growth/osmActivities";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;

  const secret = request.headers.get("x-internal-import-secret");
  const bearerToken = getBearerToken(request);
  if (process.env.IMPORT_SECRET && secret === process.env.IMPORT_SECRET) return null;
  if (process.env.CRON_SECRET && bearerToken === process.env.CRON_SECRET) return null;

  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  return error;
}

function toBoundedNumber(value: unknown, fallback: number, min: number, max: number) {
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
  if (typeof categoryGroup !== "string" || !categoryGroup.trim()) return "nightlife";
  const trimmed = categoryGroup.trim();
  return trimmed === "activities" ? "bowling" : trimmed;
}

function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "OSM activities import failed";
  console.error("[location-growth/import-osm-activities]", error);
  return NextResponse.json({ success: false, error: message }, { status });
}

async function runImport(input: Record<string, unknown>) {
  const categoryGroup = normalizeOsmCategoryGroup(input.categoryGroup);
  const maxLimit = getOsmLimitCap(categoryGroup);
  const requestedLimit = Math.min(Math.max(Number(input.limit || 25), 1), maxLimit);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : Math.min(25, maxLimit);
  const offset = toBoundedNumber(input.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const filterIndex = toBoundedNumber(input.filterIndex, 0, 0, Number.MAX_SAFE_INTEGER);

  const result = await importOsmActivities({ limit, offset, categoryGroup, filterIndex });
  return NextResponse.json({ ...result, maxLimit, success: true });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth) return auth;
    return runImport({
      categoryGroup: request.nextUrl.searchParams.get("categoryGroup"),
      limit: request.nextUrl.searchParams.get("limit"),
      offset: request.nextUrl.searchParams.get("offset"),
      filterIndex: request.nextUrl.searchParams.get("filterIndex"),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth) return auth;
    const body = await request.json().catch(() => ({}));
    return runImport(body && typeof body === "object" ? body : {});
  } catch (error) {
    return jsonError(error);
  }
}
