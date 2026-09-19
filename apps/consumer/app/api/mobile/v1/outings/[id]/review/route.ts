import { NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { analyzeReview } from "@/lib/reviewAi";
import { resolveMobileIdentity } from "../../../_lib/identity";
import { mobileError, mobileJson } from "../../../_lib/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampRating(value: unknown) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  return Math.max(1, Math.min(5, Math.round(rating)));
}

function cleanText(value: unknown, max = 2000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const identity = await resolveMobileIdentity(request);
  if (!identity || identity.kind !== "user") return mobileError("AUTH_REQUIRED", "Sign in to review this OUTing.", 401);

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const overallRating = clampRating(body?.overallRating);
  const restaurantRating = clampRating(body?.restaurantRating);
  const activityRating = clampRating(body?.activityRating);
  const matchedVibe = typeof body?.matchedVibe === "boolean" ? body.matchedVibe : null;
  const wouldGoAgain = typeof body?.wouldGoAgain === "boolean" ? body.wouldGoAgain : null;
  const feedback = cleanText(body?.feedback);
  const restaurantFeedback = cleanText(body?.restaurantFeedback);
  const activityFeedback = cleanText(body?.activityFeedback);

  if (!overallRating) return mobileError("RATING_REQUIRED", "Choose an overall rating for your OUTing.", 400);

  const admin = getSupabaseAdminClient();
  const { data: outing, error: outingError } = await admin
    .from("user_outings")
    .select("*")
    .eq("id", id)
    .eq("user_id", identity.userId)
    .maybeSingle();

  if (outingError) return mobileError("OUTING_LOAD_FAILED", "This OUTing could not be loaded.", 500);
  if (!outing) return mobileError("OUTING_NOT_FOUND", "This OUTing was not found.", 404);
  if (outing.status !== "completed" && !outing.completed_at) return mobileError("OUTING_NOT_COMPLETED", "Complete the OUTing before leaving a review.", 409);

  const submittedAt = new Date().toISOString();
  const existingPlan = outing.plan_payload && typeof outing.plan_payload === "object" ? outing.plan_payload : {};
  const mobileFeedback = {
    overallRating,
    restaurantRating,
    activityRating,
    matchedVibe,
    wouldGoAgain,
    feedback,
    restaurantFeedback,
    activityFeedback,
    submittedAt,
    source: "mobile",
  };

  const { error: updateError } = await admin
    .from("user_outings")
    .update({
      plan_payload: { ...existingPlan, mobileFeedback },
      updated_at: submittedAt,
    })
    .eq("id", id)
    .eq("user_id", identity.userId);

  if (updateError) return mobileError("REVIEW_SAVE_FAILED", "Your feedback could not be saved yet.", 500);

  let publicReviewIds: string[] = [];
  try {
    const reviews: Array<Record<string, unknown>> = [];
    const addLocationReview = async (kind: "restaurant" | "activity", locationId: string | null, rating: number | null, reviewText: string | null) => {
      if (!locationId || !rating || !reviewText || reviewText.length < 30) return;
      const ai = await analyzeReview(reviewText);
      const row: Record<string, unknown> = {
        location_id: locationId,
        location_type: kind,
        user_id: identity.userId,
        rating,
        review_text: reviewText,
        title: kind === "restaurant" ? "Restaurant review" : "Activity review",
        body: reviewText,
        status: "pending",
        verified_visit: false,
        verification_source: "mobile_completed_user_outing",
        metadata: { user_outing_id: id, source: "mobile", completed_at: outing.completed_at || null },
        ai_keywords: Array.isArray(ai.keywords) ? ai.keywords : [],
        ai_sentiment: ai.sentiment || "neutral",
        ai_score_boost: Math.max(-10, Math.min(10, Number(ai.score_boost || 0))),
        vibe: ai.vibe || "casual",
        noise_level: ai.noise_level || "moderate",
        date_night: Boolean(ai.date_night),
        group_friendly: Boolean(ai.group_friendly),
        family_friendly: Boolean(ai.family_friendly),
        occasion_fit: Array.isArray(ai.occasion_fit) ? ai.occasion_fit : [],
        service_quality: ai.service_quality || "mixed",
        food_quality: ai.food_quality || "mixed",
        ambiance_quality: ai.ambiance_quality || "mixed",
        price_feeling: ai.price_feeling || "fair",
        wait_time: ai.wait_time || "unknown",
        reservation_recommended: Boolean(ai.reservation_recommended),
        best_for: Array.isArray(ai.best_for) ? ai.best_for : [],
        avoid_if: Array.isArray(ai.avoid_if) ? ai.avoid_if : [],
      };
      if (kind === "restaurant") row.restaurant_id = locationId;
      else row.activity_id = locationId;
      reviews.push(row);
    };

    await addLocationReview("restaurant", outing.restaurant_id || null, restaurantRating, restaurantFeedback);
    await addLocationReview("activity", outing.activity_id || null, activityRating, activityFeedback);

    if (reviews.length) {
      const { data, error } = await admin.from("location_reviews").insert(reviews).select("id");
      if (!error && data) publicReviewIds = data.map((item: any) => String(item.id));
    }
  } catch (error) {
    console.warn("MOBILE_LOCATION_REVIEW_ENRICHMENT_FAILED", error instanceof Error ? error.message : error);
  }

  await trackEvent({
    event_name: "outing_feedback_submitted",
    user_id: identity.userId,
    outing_id: id,
    restaurant_location_id: outing.restaurant_id || null,
    activity_location_id: outing.activity_id || null,
    source: "mobile",
    feedback_polarity: overallRating >= 4 ? "positive" : overallRating <= 2 ? "negative" : "neutral",
    feedback_weight: overallRating,
    dedupe_key: `mobile_outing_feedback:${id}`,
    metadata: {
      overall_rating: overallRating,
      restaurant_rating: restaurantRating,
      activity_rating: activityRating,
      matched_vibe: matchedVibe,
      would_go_again: wouldGoAgain,
      has_feedback: Boolean(feedback),
      has_restaurant_review: Boolean(restaurantFeedback && restaurantFeedback.length >= 30),
      has_activity_review: Boolean(activityFeedback && activityFeedback.length >= 30),
    },
  }).catch(() => undefined);

  return mobileJson({ ok: true, submittedAt, publicReviewIds });
}
