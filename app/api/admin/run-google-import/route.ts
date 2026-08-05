import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runGooglePlacesImport, type GooglePlacesImportOptions } from "@/lib/googlePlacesImport";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

function isCronAuthorized(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return true;

  const importSecret = request.headers.get("x-internal-import-secret");
  const bearerToken = getBearerToken(request);

  if (process.env.IMPORT_SECRET && importSecret === process.env.IMPORT_SECRET) return true;
  return Boolean(process.env.CRON_SECRET && bearerToken === process.env.CRON_SECRET);
}

async function authorize(request: NextRequest) {
  if (isCronAuthorized(request)) return null;
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  return error;
}

function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function optionsFromSearchParams(request: NextRequest): GooglePlacesImportOptions {
  const { searchParams } = request.nextUrl;

  return {
    type: (searchParams.get("type") as GooglePlacesImportOptions["type"]) || "both",
    limit: boundedNumber(searchParams.get("limit"), 8, 1, 20),
    batch: searchParams.get("batch") || "all",
    primaryTag: searchParams.get("primaryTag") || searchParams.get("batch") || "all",
    areas: searchParams.get("areas") || searchParams.get("area") || "extended",
    minRating: boundedNumber(searchParams.get("minRating"), 3.8, 0, 5),
    requirePhoto: searchParams.get("requirePhoto") !== "false",
    requirePhone: searchParams.get("requirePhone") !== "false",
    requireWebsite: searchParams.get("requireWebsite") !== "false",
    requireLocation: searchParams.get("requireLocation") !== "false",
    requireCuisineType: searchParams.get("requireCuisineType") !== "false",
    requireHours: searchParams.get("requireHours") !== "false",
    maxQueries: boundedNumber(searchParams.get("maxQueries"), 6, 1, 12),
    requestedMarket: searchParams.get("market") || searchParams.get("requestedMarket") || null,
    requestedArea: searchParams.get("areas") || searchParams.get("area") || null,
    allowMarketCorrection: searchParams.get("allowMarketCorrection") === "true",
    maxRuntimeMs: 270_000,
    stopAfterChecked: boundedNumber(searchParams.get("stopAfterChecked"), 240, 20, 500),
    stopAfterImported: boundedNumber(searchParams.get("stopAfterImported"), 60, 5, 100),
  };
}

function withRunStatus(result: Record<string, unknown>) {
  const imported = Number(result.imported || 0);
  const failed = Number(result.failed || 0);
  const partial = result.partial === true;
  const status = failed > 0 && imported === 0 ? "failed" : partial || failed > 0 ? "partially_successful" : "successful";

  return {
    ...result,
    run_status: status,
    completed: status === "successful",
    needs_continuation: partial,
    quality_gate: {
      hours_required: true,
      image_required: true,
      canonical_profile_required: true,
      market_validation_required: true,
      duplicate_clearance_required: true,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const authError = await authorize(request);
    if (authError) return authError;

    const result = await runGooglePlacesImport(optionsFromSearchParams(request));
    return NextResponse.json(withRunStatus(result as Record<string, unknown>));
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, run_status: "failed", error: getErrorMessage(error) || "Google import failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await authorize(request);
    if (authError) return authError;

    const body = await request.json().catch(() => ({}));
    const result = await runGooglePlacesImport({
      type: body.type || "both",
      limit: Math.min(8, Math.max(1, Number(body.limit || 5))),
      batch: body.batch || "all",
      primaryTag: body.primaryTag || body.batch || "all",
      areas: body.areas || body.area || "nyc",
      minRating: Number(body.minRating || 3.8),
      requirePhoto: body.requirePhoto !== false,
      requirePhone: body.requirePhone !== false,
      requireWebsite: body.requireWebsite !== false,
      requireLocation: body.requireLocation !== false,
      requireCuisineType: body.requireCuisineType !== false,
      requireHours: body.requireHours !== false,
      maxQueries: Math.min(4, Math.max(1, Number(body.maxQueries || 2))),
      requestedMarket: body.market || body.requestedMarket || null,
      requestedArea: body.areas || body.area || null,
      allowMarketCorrection: body.allowMarketCorrection === true,
      cursor: body.cursor || null,
      interactive: true,
      maxRuntimeMs: 45_000,
      stopAfterChecked: 30,
      stopAfterImported: 10,
    });

    return NextResponse.json(withRunStatus(result as Record<string, unknown>));
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, run_status: "failed", error: getErrorMessage(error) || "Google import failed" },
      { status: 500 },
    );
  }
}
