import { supabaseAdmin } from "@/lib/supabase-admin";

export async function getLocationMlScoreMap(locationIds: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(locationIds.filter(Boolean)));
  const scores = new Map<string, number>();
  if (ids.length === 0 || process.env.NODE_ENV !== "production" || process.env.VITEST === "true") return scores;
  try {
    const { data, error } = await supabaseAdmin
      .from("location_ml_features")
      .select("location_id,ml_score")
      .in("location_id", ids);
    if (error) {
      console.warn("location_ml_features unavailable; search will continue without ML scores", error.message);
      return scores;
    }
    for (const row of data || []) scores.set(String(row.location_id), Number(row.ml_score || 0));
  } catch (error) {
    console.warn("Failed to load location ML scores; search will continue without ML scores", error);
  }
  return scores;
}
