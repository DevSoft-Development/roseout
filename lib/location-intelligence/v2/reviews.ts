import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { reviewRefreshCadenceDays } from "@/lib/location-intelligence/v2/policy";

export function nextReviewRefreshAt(input: {
  popularityScore: number;
  lastRefreshedAt?: string | null;
}) {
  const days = reviewRefreshCadenceDays(input.popularityScore);
  if (!days) return null;
  const base = input.lastRefreshedAt ? new Date(input.lastRefreshedAt) : new Date();
  if (!Number.isFinite(base.getTime())) return null;
  return new Date(base.getTime() + days * 86_400_000).toISOString();
}

export function shouldRefreshReviews(input: {
  popularityScore: number;
  lastRefreshedAt?: string | null;
  now?: Date;
}) {
  const next = nextReviewRefreshAt(input);
  if (!next) return false;
  return new Date(next).getTime() <= (input.now || new Date()).getTime();
}

export async function scheduleReviewRefresh(input: {
  locationId: string;
  provider: string;
  popularityScore: number;
  lastRefreshedAt?: string | null;
  lastReviewExternalId?: string | null;
  lastReviewPublishedAt?: string | null;
}) {
  const nextRefreshAt = nextReviewRefreshAt(input);
  const { error } = await supabaseAdmin
    .from("location_review_refresh_state")
    .upsert({
      location_id: input.locationId,
      provider: input.provider,
      popularity_score: input.popularityScore,
      last_refreshed_at: input.lastRefreshedAt || null,
      last_review_external_id: input.lastReviewExternalId || null,
      last_review_published_at: input.lastReviewPublishedAt || null,
      next_refresh_at: nextRefreshAt,
      refresh_enabled: Boolean(nextRefreshAt),
      updated_at: new Date().toISOString(),
    }, { onConflict: "location_id,provider" });
  if (error) throw new Error(`Review refresh schedule failed: ${error.message}`);
  return nextRefreshAt;
}

export async function dueReviewRefreshes(limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const { data, error } = await supabaseAdmin
    .from("location_review_refresh_state")
    .select("*")
    .eq("refresh_enabled", true)
    .lte("next_refresh_at", new Date().toISOString())
    .order("next_refresh_at", { ascending: true })
    .limit(safeLimit);
  if (error) throw new Error(`Review refresh due queue failed: ${error.message}`);
  return data || [];
}
