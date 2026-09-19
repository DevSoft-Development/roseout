import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { calculateStagingQuality } from "@/lib/location-growth/stagingQuality";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") ===
      process.env.IMPORT_SECRET
  ) {
    return null;
  }
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
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
  const message = error instanceof Error ? error.message : String(error);
  console.error("[location-growth/score-staged]", error);
  return NextResponse.json({ success: false, error: message }, { status });
}

function needsScoringQuery() {
  return supabaseAdmin
    .from("location_import_staging")
    .select("*", { count: "exact" })
    .eq("import_status", "staged")
    .or(
      "quality_status.in.(needs_review,unchecked),quality_status.is.null,quality_score.is.null,normalized_name.is.null,normalized_address.is.null,location_key.is.null",
    );
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth) return auth;

    const body = await request.json().catch(() => ({}));
    const batchId =
      typeof body.batchId === "string" && body.batchId.trim()
        ? body.batchId.trim()
        : null;
    const limit = toBoundedNumber(body.limit, 250, 1, 500);

    let query = needsScoringQuery()
      .order("created_at", { ascending: true })
      .limit(limit);
    if (batchId) query = query.eq("batch_id", batchId);

    const { data, error } = await query;
    if (error) throw new Error(`Score chunk select failed: ${error.message}`);

    const rows = data || [];
    const counts = {
      processed: rows.length,
      publishReady: 0,
      review: 0,
      rejected: 0,
      needsPhoto: 0,
    };

    for (const row of rows) {
      const scored = calculateStagingQuality(row);
      if (scored.quality_status === "publish_ready") counts.publishReady += 1;
      if (scored.quality_status === "review") counts.review += 1;
      if (scored.quality_status === "reject") counts.rejected += 1;
      if (scored.quality_status === "needs_photo") counts.needsPhoto += 1;

      const { error: updateError } = await supabaseAdmin
        .from("location_import_staging")
        .update({
          ...scored,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`Score chunk update failed: ${updateError.message}`);
      }
    }

    let remainingQuery = needsScoringQuery();
    if (batchId) remainingQuery = remainingQuery.eq("batch_id", batchId);
    const { count: remainingCount, error: countError } =
      await remainingQuery.limit(1);
    if (countError)
      throw new Error(`Score remaining count failed: ${countError.message}`);

    return NextResponse.json({
      success: true,
      processed: counts.processed,
      publishReady: counts.publishReady,
      review: counts.review,
      rejected: counts.rejected,
      needsPhoto: counts.needsPhoto,
      hasMore: (remainingCount || 0) > 0,
    });
  } catch (error) {
    return jsonError(error);
  }
}
