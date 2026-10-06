import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { reviewRefreshCadenceDays } from "@/lib/location-intelligence/v2/policy";

export function nextReviewRefreshAt(input: {
  popularityScore: number;
  lastRefreshedAt?: string | null;
  now?: Date;
}) {
  const days = reviewRefreshCadenceDays(input.popularityScore);
  if (!days) return null;

  const now = input.now || new Date();
  if (!Number.isFinite(now.getTime())) return null;

  // First review ingestion should happen immediately. The normal popularity-based
  // cadence begins only after we have actually collected a review snapshot.
  if (!input.lastRefreshedAt) return now.toISOString();

  const base = new Date(input.lastRefreshedAt);
  if (!Number.isFinite(base.getTime())) return null;
  return new Date(base.getTime() + days * 86_400_000).toISOString();
}

export function shouldRefreshReviews(input: {
  popularityScore: number;
  lastRefreshedAt?: string | null;
  now?: Date;
}) {
  const next = nextReviewRefreshAt({ ...input, now: input.now });
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


export async function automaticReviewRefreshEnabled() {
  const { data, error } = await supabaseAdmin
    .from("location_provider_registry")
    .select("metadata")
    .eq("provider", "dataforseo")
    .maybeSingle();
  if (error) throw new Error(`Review refresh policy read failed: ${error.message}`);
  const metadata = data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
    ? data.metadata as Record<string, unknown>
    : {};
  return metadata.automatic_review_refresh_enabled === true;
}
