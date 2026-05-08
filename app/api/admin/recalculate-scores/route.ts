import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function calculateScore(item: any) {
  const rating = Number(item.rating || 0);
  const reviewCount = Number(item.review_count || 0);
  const viewCount = Number(item.view_count || 0);
  const clickCount = Number(item.click_count || 0);
  const claimCount = Number(item.claim_count || 0);
  const qualityScore = Number(item.quality_score || 0);
  const popularityScore = Number(item.popularity_score || 0);

  return Number(
    (
      rating * 20 +
      reviewCount * 0.15 +
      viewCount * 0.05 +
      clickCount * 0.25 +
      claimCount * 5 +
      qualityScore * 0.3 +
      popularityScore * 0.3
    ).toFixed(2)
  );
}

export async function POST() {
  const { data: restaurants } = await supabaseAdmin
    .from("restaurants")
    .select("*");

  const { data: activities } = await supabaseAdmin
    .from("activities")
    .select("*");

  for (const restaurant of restaurants || []) {
    await supabaseAdmin
      .from("restaurants")
      .update({ theouthaven_score: calculateScore(restaurant) })
      .eq("id", restaurant.id);
  }

  for (const activity of activities || []) {
    await supabaseAdmin
      .from("activities")
      .update({ theouthaven_score: calculateScore(activity) })
      .eq("id", activity.id);
  }

  return NextResponse.json({ success: true });
}