import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { generateMissingLocationQrs } from "@/lib/qr/locationQr";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

function toBoundedNumber(value: unknown, fallback: number, min: number, max: number) {
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
        : "Failed to publish ready records";

  console.error("[location-growth/publish]", error);

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status },
  );
}

async function getRemainingPublishReady() {
  const { count, error } = await supabaseAdmin
    .from("location_import_staging")
    .select("id", { count: "exact", head: true })
    .eq("import_status", "staged")
    .eq("quality_status", "publish_ready")
    .eq("duplicate_status", "unique")
    .not("address", "is", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .not("primary_category", "is", null);

  if (error) {
    console.error("[location-growth/publish] remaining count failed", error);
    return null;
  }

  return count ?? 0;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth) return auth;

    const body = await request.json().catch(() => ({}));

    const limit = toBoundedNumber(body.limit, 500, 1, 1000);
    const batchId =
      typeof body.batchId === "string" && body.batchId.trim()
        ? body.batchId.trim()
        : null;
    const publishAll = body.all === true || !batchId;

    if (publishAll) {
      const { data, error } = await supabaseAdmin.rpc(
        "oh_publish_ready_staged_locations",
        {
          p_limit: limit,
        },
      );

      if (error) {
        throw new Error(
          `Failed to publish all ready staged records: ${error.message}`,
        );
      }

      const remainingPublishReady = await getRemainingPublishReady();
      const qr = await generateMissingLocationQrs(limit);

      return NextResponse.json({
        success: true,
        scope: "all",
        limit,
        ...(typeof data === "object" && data ? data : {}),
        remainingPublishReady,
        qr,
      });
    }

    const { data, error } = await supabaseAdmin.rpc("oh_publish_import_batch", {
      p_batch_id: batchId,
      p_limit: limit,
    });

    if (error) {
      throw new Error(`Failed to publish batch ${batchId}: ${error.message}`);
    }

    const remainingPublishReady = await getRemainingPublishReady();
    const qr = await generateMissingLocationQrs(limit);

    return NextResponse.json({
      success: true,
      scope: "batch",
      batchId,
      limit,
      ...(typeof data === "object" && data ? data : {}),
      remainingPublishReady,
      qr,
    });
  } catch (error) {
    return jsonError(error);
  }
}
