import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { dedupeStagedLocationsChunk } from "@/lib/location-growth/dedupeStaging";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET
  ) {
    return null;
  }
  const { error } = await requireAdminApiRole(["admin", "superadmin"]);
  return error;
}

function toBoundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.trunc(numeric), min), max);
}

function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[location-growth/dedupe]", error);
  return NextResponse.json({ success: false, error: message }, { status });
}

async function countRemainingUnchecked(batchId?: string | null) {
  let query = supabaseAdmin
    .from("location_import_staging")
    .select("id", { count: "exact", head: true })
    .eq("import_status", "staged")
    .in("duplicate_status", ["unchecked", "unique", "possible_duplicate"])
    .neq("quality_status", "reject");

  if (batchId) query = query.eq("batch_id", batchId);

  const { count, error } = await query;
  if (error) throw new Error(`Remaining dedupe count failed: ${error.message}`);
  return count || 0;
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
    const scope = body.all === true || !batchId ? "all" : "batch";
    const limit = toBoundedNumber(body.limit, 250, 1, 500);

    if (scope === "batch") {
      await supabaseAdmin.rpc("oh_refresh_staging_quality", {
        p_batch_id: batchId,
      });
    }

    const result = await dedupeStagedLocationsChunk({
      batchId: scope === "batch" ? batchId : null,
      limit,
    });
    const remainingUnchecked = await countRemainingUnchecked(
      scope === "batch" ? batchId : null,
    );

    return NextResponse.json({
      success: true,
      scope,
      batchId: scope === "batch" ? batchId : undefined,
      limit,
      processed: result.processed,
      duplicate: result.duplicate,
      possibleDuplicate: result.possibleDuplicate,
      unique: result.unique,
      rejected: result.rejected,
      hasMore: result.hasMore || remainingUnchecked > 0,
      remainingUnchecked,
      message:
        result.processed === 0 ? "No more staged records need dedupe." : undefined,
    });
  } catch (error) {
    return jsonError(error);
  }
}
