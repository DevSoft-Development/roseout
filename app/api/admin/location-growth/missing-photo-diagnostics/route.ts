import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(request: Request) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET
  ) {
    return null;
  }
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  return error;
}

function isMissing(value: unknown) {
  return value == null || String(value).trim().length === 0;
}

function getMissingPhotoReason(row: Record<string, unknown>) {
  if (row.has_photos === true && row.photo_status === "missing_photo") {
    return "Status mismatch: has_photos is true but photo_status is missing_photo";
  }

  if (row.duplicate_status !== "unique") {
    return "Not eligible: duplicate_status is not unique";
  }

  const qualityScore = Number(row.quality_score);
  if (!Number.isFinite(qualityScore) || qualityScore < 75) {
    return "Not eligible: quality_score below 75";
  }

  if (row.is_searchable !== true) {
    return "Not searchable";
  }

  if (row.enrichment_status === "failed" && !isMissing(row.photo_backfill_error)) {
    return `Backfill failed: ${String(row.photo_backfill_error)}`;
  }

  if (isMissing(row.google_place_id)) {
    return "No Google Place ID yet";
  }

  return "Eligible, but Google may not have returned a photo yet";
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth) return auth;

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(
      "id,name,restaurant_name,activity_name,location_type,address,city,state,quality_score,quality_status,duplicate_status,enrichment_status,is_searchable,is_hidden,status,has_photos,photo_status,photo_backfill_error,google_place_id,main_image,image_url,photo_url,updated_at",
    )
    .or("has_photos.eq.false,photo_status.eq.missing_photo")
    .order("is_searchable", { ascending: false, nullsFirst: false })
    .order("quality_score", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message, totalReturned: 0, rows: [] },
      { status: 500 },
    );
  }

  const rows = (data || []).map((row) => ({
    ...row,
    reason: getMissingPhotoReason(row as Record<string, unknown>),
  }));

  return NextResponse.json({
    success: true,
    totalReturned: rows.length,
    rows,
  });
}
