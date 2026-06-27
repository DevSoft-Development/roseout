import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { refreshLocationReviewScore } from "@/lib/reviews/refresh-location-review-score";
import { recalculateReviewIntelligenceForLocation } from "@/app/api/admin/ml/recalculate-review-intelligence/route";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.reviewsModerate);
  if (auth.error) return auth.error;
  const { reviewId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const { data: review, error: loadError } = await supabaseAdmin.from("location_reviews").select("id,location_id,verified_visit").eq("id", reviewId).maybeSingle();
  if (loadError || !review) return NextResponse.json({ ok: false, error: "review_not_found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (action === "approve") {
    if (!review.verified_visit) return NextResponse.json({ ok: false, error: "verified_visit_required", message: "Normal approval requires a verified visit. Use approve_with_verification for admin verification." }, { status: 400 });
    Object.assign(patch, { status: "approved", approved_at: new Date().toISOString(), rejected_at: null });
  } else if (action === "approve_with_verification") {
    Object.assign(patch, { status: "approved", verified_visit: true, verification_source: "admin_verified", verified_at: new Date().toISOString(), approved_at: new Date().toISOString(), rejected_at: null });
  } else if (action === "reject") {
    Object.assign(patch, { status: "rejected", rejected_at: new Date().toISOString(), moderation_notes: body.moderationNotes || null });
  } else if (action === "flag") {
    Object.assign(patch, { status: "flagged", moderation_notes: body.moderationNotes || null });
  } else if (action === "refresh_location_score") {
    const refreshed = await refreshLocationReviewScore(review.location_id);
    return NextResponse.json({ ok: true, refreshed });
  } else {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin.from("location_reviews").update(patch).eq("id", reviewId).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await refreshLocationReviewScore(review.location_id);
  if (action === "approve" || action === "approve_with_verification") {
    try {
      await recalculateReviewIntelligenceForLocation(review.location_id);
    } catch (error) {
      console.warn("Review intelligence refresh failed", error);
    }
  }
  return NextResponse.json({ ok: true, review: updated });
}
