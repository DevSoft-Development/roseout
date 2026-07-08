import { supabaseAdmin } from "@/lib/supabase-admin";

export async function refreshLocationReviewScore(locationId: string) {
  const { data: reviews, error } = await supabaseAdmin
    .from("location_reviews")
    .select("rating, ai_keywords, ai_score_boost")
    .eq("location_id", locationId)
    .eq("status", "approved")
    .eq("verified_visit", true);

  if (error) throw new Error(error.message);

  const reviewCount = reviews?.length || 0;
  const avgRating = reviewCount > 0 ? reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviewCount : 0;
  const avgBoost = reviewCount > 0 ? reviews.reduce((sum, r) => sum + Number(r.ai_score_boost || 0), 0) / reviewCount : 0;
  const uniqueKeywords = Array.from(new Set((reviews || []).flatMap((r: any) => Array.isArray(r.ai_keywords) ? r.ai_keywords : []))).slice(0, 30);
  const reviewScore = Math.round(Math.min(100, Math.max(0, avgRating * 20 + avgBoost)));

  const { error: updateError } = await supabaseAdmin
    .from("locations")
    .update({ review_score: reviewScore, review_keywords: uniqueKeywords, review_count: reviewCount })
    .eq("id", locationId);

  if (updateError) throw new Error(updateError.message);
  return { location_id: locationId, review_score: reviewScore, review_count: reviewCount, keywords: uniqueKeywords };
}
