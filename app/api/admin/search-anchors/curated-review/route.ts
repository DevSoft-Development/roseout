import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const roles = ["superadmin", "admin", "manager"] as const;
const MAX_SELECTION = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReviewAction = "approve" | "reject" | "pending_review";

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(roles);
  if (auth.error) return auth.error;

  try {
    const payload = (await request.json()) as { ids?: unknown; action?: unknown };
    const ids = Array.isArray(payload.ids)
      ? [...new Set(payload.ids.filter((value): value is string => typeof value === "string" && UUID_PATTERN.test(value)))]
      : [];
    const action = payload.action as ReviewAction;

    if (!ids.length) {
      return NextResponse.json({ success: false, error: "Select at least one curated anchor." }, { status: 400 });
    }
    if (ids.length > MAX_SELECTION) {
      return NextResponse.json({ success: false, error: `You can review up to ${MAX_SELECTION} anchors at once.` }, { status: 400 });
    }
    if (!(["approve", "reject", "pending_review"] as const).includes(action)) {
      return NextResponse.json({ success: false, error: "Choose a valid review action." }, { status: 400 });
    }

    const reviewStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending_review";
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("search_anchors")
      .update({
        review_status: reviewStatus,
        is_active: action === "approve",
        is_searchable: action === "approve",
        updated_at: now,
      })
      .eq("source_type", "curated")
      .in("id", ids)
      .select("id");

    if (error) throw error;

    return NextResponse.json({
      success: true,
      updated: data?.length ?? 0,
      reviewStatus,
    });
  } catch (error) {
    console.error("[search-anchors/curated-review] review failed", error);
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "Unable to update curated anchors.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
