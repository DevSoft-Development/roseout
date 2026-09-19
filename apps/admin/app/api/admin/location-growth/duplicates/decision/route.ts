import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Decision = "duplicate" | "unique" | "reject";

async function authorize(request: NextRequest) {
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

function isDecision(value: unknown): value is Decision {
  return value === "duplicate" || value === "unique" || value === "reject";
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth) return auth;

  const body = await request.json().catch(() => ({}));
  const stagingId = String(body.stagingId || "").trim();
  const existingLocationId = String(body.existingLocationId || "").trim();
  const decision = body.decision;

  if (!stagingId || !isDecision(decision)) {
    return NextResponse.json(
      { success: false, error: "stagingId and a valid decision are required." },
      { status: 400 },
    );
  }

  const stagingUpdates =
    decision === "duplicate"
      ? {
          duplicate_status: "duplicate",
          import_status: "duplicate",
          matched_location_id: existingLocationId || null,
          updated_at: new Date().toISOString(),
        }
      : decision === "unique"
        ? {
            duplicate_status: "unique",
            import_status: "staged",
            matched_location_id: null,
            updated_at: new Date().toISOString(),
          }
        : {
            import_status: "rejected",
            rejection_reason: "admin_rejected",
            updated_at: new Date().toISOString(),
          };

  const { error: stagingError } = await supabaseAdmin
    .from("location_import_staging")
    .update(stagingUpdates)
    .eq("id", stagingId);

  if (stagingError) {
    return NextResponse.json(
      { success: false, error: stagingError.message },
      { status: 500 },
    );
  }

  if (existingLocationId) {
    await supabaseAdmin
      .from("location_duplicate_matches")
      .update({ decision })
      .eq("staging_id", stagingId)
      .eq("existing_location_id", existingLocationId);
  }

  return NextResponse.json({ success: true, stagingId, existingLocationId, decision });
}
