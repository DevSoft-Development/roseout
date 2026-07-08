import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { analyzeReview } from "@/lib/reviewAi";
import { refreshLocationReviewScore } from "@/lib/reviews/refresh-location-review-score";
import { trackEvent } from "@/lib/analytics/trackEvent";

async function getVerifiedEligibility(body: any) {
  const reviewToken = typeof body.reviewToken === "string" ? body.reviewToken.trim() : null;
  const eligibilityId = typeof body.eligibilityId === "string" ? body.eligibilityId.trim() : null;
  if (reviewToken) {
    const { data, error } = await supabaseAdmin.from("location_review_eligibility").select("*").eq("review_token", reviewToken).maybeSingle();
    if (error || !data) return { error: "invalid_review_token", status: 403 };
    if (data.status !== "eligible") return { error: "review_token_not_eligible", status: 403 };
    if (data.review_token_expires_at && new Date(data.review_token_expires_at).getTime() < Date.now()) return { error: "review_token_expired", status: 403 };
    return { eligibility: data };
  }
  if (eligibilityId) {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return { error: "authentication_required", status: 401 };
    const { data, error } = await supabaseAdmin.from("location_review_eligibility").select("*").eq("id", eligibilityId).maybeSingle();
    if (error || !data || data.user_id !== userId || data.status !== "eligible") return { error: "invalid_eligibility", status: 403 };
    return { eligibility: data };
  }
  return { error: "verified_visit_required", status: 403, message: "Reviews are available after a verified TheOutHaven outing." };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { location_id, customer_name, rating, review_text } = body;
    const eligibilityResult = await getVerifiedEligibility(body);
    if (eligibilityResult.error) {
      return NextResponse.json({ ok: false, error: eligibilityResult.error, message: eligibilityResult.message || "Reviews require verified outing eligibility." }, { status: eligibilityResult.status });
    }
    const eligibility: any = eligibilityResult.eligibility;
    if (!location_id || location_id !== eligibility.location_id) return NextResponse.json({ ok: false, error: "location_mismatch" }, { status: 400 });
    if (!rating || !review_text) return NextResponse.json({ ok: false, error: "missing_required_review_fields" }, { status: 400 });

    const existingQuery = supabaseAdmin.from("location_reviews").select("id").eq("location_id", location_id).limit(1);
    if (eligibility.outing_id) existingQuery.eq("outing_id", eligibility.outing_id);
    else if (eligibility.reservation_id) existingQuery.eq("reservation_id", eligibility.reservation_id);
    else existingQuery.eq("review_token", eligibility.review_token);
    const { data: existing } = await existingQuery.maybeSingle();
    if (existing) return NextResponse.json({ ok: false, error: "review_already_submitted" }, { status: 409 });

    const cleanReview = String(review_text).trim();
    if (cleanReview.length < 30) return NextResponse.json({ ok: false, error: "review_too_short", message: "Please leave a full-sentence review with more detail." }, { status: 400 });
    const safeRating = Math.min(5, Math.max(1, Number(rating || 5)));
    const ai = await analyzeReview(cleanReview);
    const safeKeywords = Array.isArray(ai.keywords) ? ai.keywords : [];
    const safeScoreBoost = Math.min(10, Math.max(-10, Number(ai.score_boost || 0)));

    const { data: review, error: insertError } = await supabaseAdmin.from("location_reviews").insert({
      location_id,
      customer_name: customer_name || eligibility.guest_name || "TheOutHaven Guest",
      rating: safeRating,
      review_text: cleanReview,
      user_id: eligibility.user_id,
      outing_id: eligibility.outing_id,
      reservation_id: eligibility.reservation_id,
      visit_id: eligibility.visit_id,
      guest_session_id: eligibility.guest_session_id,
      guest_email: eligibility.guest_email,
      guest_name: eligibility.guest_name,
      verified_visit: true,
      verification_source: eligibility.source,
      verified_at: new Date().toISOString(),
      review_token: eligibility.review_token,
      review_token_expires_at: eligibility.review_token_expires_at,
      review_token_used_at: new Date().toISOString(),
      status: "pending",
      ai_keywords: safeKeywords,
      ai_sentiment: ai.sentiment || "neutral",
      ai_score_boost: safeScoreBoost,
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
    }).select("id,status").single();

    if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });

    await supabaseAdmin.from("location_review_eligibility").update({ status: "reviewed", review_id: review.id, reviewed_at: new Date().toISOString() }).eq("id", eligibility.id);
    await trackEvent({ event_name: "verified_review_submitted", user_id: eligibility.user_id, outing_id: eligibility.outing_id, location_id, metadata: { guest_session_id: eligibility.guest_session_id, source: eligibility.source } });

    if (review.status === "approved") await refreshLocationReviewScore(location_id);

    return NextResponse.json({ ok: true, success: true, location_id, review_id: review.id, status: "pending", ai });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || "Something went wrong." }, { status: 500 });
  }
}
