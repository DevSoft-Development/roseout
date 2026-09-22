import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Body = {
  locationId?: string;
  action?: "check" | "clear_stale";
};

const REVIEW_FIELDS =
  "id,location_a_id,location_b_id,duplicate_score,match_reasons,status,decision_reason,created_at,updated_at";

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const locationId = String(body.locationId || "").trim();
    const action = body.action || "check";

    if (!locationId) {
      return NextResponse.json(
        { success: false, error: "locationId is required." },
        { status: 400 },
      );
    }

    const { data: location, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id,name,duplicate_status,is_hidden,public_visibility_tier,is_searchable")
      .eq("id", locationId)
      .maybeSingle();

    if (locationError) throw locationError;
    if (!location) {
      return NextResponse.json(
        { success: false, error: "Location was not found." },
        { status: 404 },
      );
    }

    const { data: reviewRows, error: reviewError } = await supabaseAdmin
      .from("location_duplicate_review")
      .select(REVIEW_FIELDS)
      .or(`location_a_id.eq.${locationId},location_b_id.eq.${locationId}`)
      .order("duplicate_score", { ascending: false })
      .limit(25);

    if (reviewError) throw reviewError;

    const rows = reviewRows || [];
    const blockingRows = rows.filter((row: any) =>
      ["pending", "merged"].includes(String(row.status || "").toLowerCase()),
    );
    const duplicateStatus = String(location.duplicate_status || "unknown").toLowerCase();
    const staleDuplicateFlag = duplicateStatus === "duplicate" && blockingRows.length === 0;

    if (action === "clear_stale") {
      if (duplicateStatus !== "duplicate") {
        return NextResponse.json({
          success: true,
          changed: false,
          message: "This location is not currently marked as a duplicate.",
          duplicateStatus,
          reviewRows: rows,
        });
      }

      if (blockingRows.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This location has an active duplicate review record. Review or merge the pair from the Duplicates tool instead of clearing the flag.",
            duplicateStatus,
            blockingRows,
            reviewRows: rows,
          },
          { status: 409 },
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from("locations")
        .update({
          duplicate_status: "not_duplicate",
          updated_at: new Date().toISOString(),
        })
        .eq("id", locationId);

      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        changed: true,
        message:
          "The stale duplicate flag was cleared. Hidden visibility remains a separate blocker until an admin intentionally unhides the location.",
        duplicateStatus: "not_duplicate",
        reviewRows: rows,
      });
    }

    return NextResponse.json({
      success: true,
      locationId,
      duplicateStatus,
      hasReviewRows: rows.length > 0,
      hasBlockingReviewRows: blockingRows.length > 0,
      staleDuplicateFlag,
      reviewRows: rows,
      message: staleDuplicateFlag
        ? "This location is marked duplicate but has no pending or merged duplicate-review pair."
        : blockingRows.length > 0
          ? "This location has an active duplicate-review pair."
          : "No active duplicate-review blocker was found.",
    });
  } catch (error) {
    console.error("Duplicate status check failed", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not check duplicate status.",
      },
      { status: 500 },
    );
  }
}
