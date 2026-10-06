import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  createDataForSeoReviewTask,
  getDataForSeoReviewTask,
} from "@/lib/location-intelligence/v2/dataforseo";
import {
  dueReviewRefreshes,
  nextReviewRefreshAt,
} from "@/lib/location-intelligence/v2/reviews";
import { storeProviderSnapshot } from "@/lib/location-intelligence/v2/evidence";

function locationName(row: Record<string, unknown>) {
  return String(row.name || row.restaurant_name || row.activity_name || "").trim();
}

type RawReview = {
  review_id?: string;
  review_text?: string;
  original_review_text?: string;
  timestamp?: string;
  profile_name?: string;
  rating?: { value?: number } | number;
  review_highlights?: Array<{ feature?: string; assessment?: string }>;
  [key: string]: unknown;
};

const CONCEPT_RULES: Array<[string, RegExp]> = [
  ["romantic", /\b(romantic|date night|anniversary|intimate)\b/i],
  ["lively", /\b(lively|energetic|vibrant|party|fun atmosphere)\b/i],
  ["quiet", /\b(quiet|peaceful|calm|relaxed|intimate)\b/i],
  ["upscale", /\b(upscale|elegant|luxury|fancy|fine dining)\b/i],
  ["casual", /\b(casual|laid back|laid-back|relaxed)\b/i],
  ["birthday", /\b(birthday|celebration|celebrate)\b/i],
  ["groups", /\b(group|groups|party of|large party|friends)\b/i],
  ["family", /\b(family|kids|children|kid friendly|family friendly)\b/i],
  ["cocktails", /\b(cocktail|cocktails|drinks|mixology|bartender)\b/i],
  ["service", /\b(service|server|waiter|waitress|staff|host|hostess)\b/i],
  ["noise", /\b(loud|noisy|noise|music volume)\b/i],
  ["parking", /\b(parking|valet|garage)\b/i],
  ["views", /\b(view|views|skyline|scenic|waterfront)\b/i],
  ["rooftop", /\b(rooftop|roof top|roof deck|terrace)\b/i],
  ["live_music", /\b(live music|jazz|band|dj|d\.j\.)\b/i],
  ["value", /\b(value|worth|price|prices|expensive|overpriced|affordable)\b/i],
  ["wait_time", /\b(wait|waited|waiting|line|reservation delay)\b/i],
  ["portion_size", /\b(portion|portions|serving size)\b/i],
  ["food_quality", /\b(food|dish|meal|steak|seafood|sushi|pasta|entree|appetizer)\b/i],
];

function reviewRating(review: RawReview) {
  if (typeof review.rating === "number") return review.rating;
  const value = Number(review.rating?.value);
  return Number.isFinite(value) ? value : null;
}

function reviewText(review: RawReview) {
  return String(review.original_review_text || review.review_text || "").trim();
}

function reviewTimestamp(review: RawReview) {
  const raw = String(review.timestamp || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function reviewConcepts(review: RawReview) {
  const highlights = Array.isArray(review.review_highlights)
    ? review.review_highlights.map((item) => [item.feature, item.assessment].filter(Boolean).join(" ")).join(" ")
    : "";
  const text = [reviewText(review), highlights].filter(Boolean).join(" ");
  return CONCEPT_RULES.filter(([, pattern]) => pattern.test(text)).map(([concept]) => concept);
}

function extractReviewItems(payload: any): RawReview[] {
  const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
  return tasks.flatMap((task: any) => {
    const results = Array.isArray(task?.result) ? task.result : [];
    return results.flatMap((result: any) => Array.isArray(result?.items) ? result.items : []);
  }).filter((item: any) => item && typeof item === "object");
}

function taskReady(payload: any) {
  const task = Array.isArray(payload?.tasks) ? payload.tasks[0] : null;
  if (!task) return false;
  return Number(task.status_code || 0) === 20000 && Array.isArray(task.result);
}

async function refreshReviewIntelligence(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("location_external_reviews")
    .select("external_review_id,published_at,rating,review_text,payload")
    .eq("location_id", locationId)
    .order("published_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`External review intelligence read failed: ${error.message}`);

  const now = Date.now();
  const cutoff90 = now - 90 * 86_400_000;
  const cutoff12m = now - 365 * 86_400_000;
  const concepts = new Map<string, {
    lifetime: number;
    y12: number;
    d90: number;
    positive: number;
    negative: number;
  }>();

  for (const row of data || []) {
    const raw = row.payload && typeof row.payload === "object"
      ? row.payload as RawReview
      : ({ review_text: row.review_text, rating: row.rating, timestamp: row.published_at } as RawReview);
    const rating = Number(row.rating ?? reviewRating(raw));
    const published = row.published_at ? new Date(row.published_at).getTime() : 0;
    for (const concept of reviewConcepts(raw)) {
      const state = concepts.get(concept) || { lifetime: 0, y12: 0, d90: 0, positive: 0, negative: 0 };
      state.lifetime += 1;
      if (published >= cutoff12m) state.y12 += 1;
      if (published >= cutoff90) state.d90 += 1;
      if (Number.isFinite(rating) && rating >= 4) state.positive += 1;
      if (Number.isFinite(rating) && rating <= 2) state.negative += 1;
      concepts.set(concept, state);
    }
  }

  if (!concepts.size) return 0;

  const rows = [...concepts.entries()].map(([concept, state]) => {
    const sentimentTotal = state.positive + state.negative;
    const recentRatio = state.lifetime ? state.d90 / state.lifetime : 0;
    return {
      location_id: locationId,
      concept,
      lifetime_count: state.lifetime,
      trailing_12m_count: state.y12,
      trailing_90d_count: state.d90,
      positive_ratio: sentimentTotal ? state.positive / sentimentTotal : null,
      negative_ratio: sentimentTotal ? state.negative / sentimentTotal : null,
      confidence: Math.min(1, state.lifetime / 20),
      trend: recentRatio >= 0.5 ? "recently_prominent" : recentRatio <= 0.1 ? "historical" : "stable",
      evidence: { source: "external_reviews", reviewCount: state.lifetime },
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertError } = await supabaseAdmin
    .from("location_review_intelligence")
    .upsert(rows, { onConflict: "location_id,concept" });
  if (upsertError) throw new Error(`Review intelligence upsert failed: ${upsertError.message}`);
  return rows.length;
}

export async function submitDueDataForSeoReviewRefreshes(limit = 25) {
  const due = await dueReviewRefreshes(limit);
  const results: Array<{ locationId: string; submitted: boolean; taskId?: string; error?: string }> = [];

  for (const item of due as Array<Record<string, any>>) {
    if (String(item.provider) !== "dataforseo") continue;
    const locationId = String(item.location_id || "");
    if (!locationId) continue;

    try {
      const [{ data: location, error: locationError }, { data: identity, error: identityError }] = await Promise.all([
        supabaseAdmin
          .from("locations")
          .select("id,name,restaurant_name,activity_name,city,state,latitude,longitude")
          .eq("id", locationId)
          .single(),
        supabaseAdmin
          .from("location_external_identities")
          .select("external_id")
          .eq("location_id", locationId)
          .eq("provider", "google")
          .eq("is_current", true)
          .eq("status", "active")
          .maybeSingle(),
      ]);
      if (locationError) throw new Error(locationError.message);
      if (identityError) throw new Error(identityError.message);

      const name = locationName(location || {});
      const googlePlaceId = String(identity?.external_id || "").trim();
      if (!name || !googlePlaceId) throw new Error("review_refresh_identity_incomplete");

      const latitude = Number(location?.latitude);
      const longitude = Number(location?.longitude);
      const locationCoordinate =
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180
          ? `${latitude},${longitude},200`
          : undefined;
      const geo = [location?.city, location?.state, "United States"].filter(Boolean).join(",");
      const task = await createDataForSeoReviewTask({
        googlePlaceId,
        locationCoordinate,
        locationName: locationCoordinate ? undefined : (geo || "United States"),
        depth: 100,
        sortBy: "newest",
        tag: `toh:${locationId}`,
      });

      const { error: updateError } = await supabaseAdmin
        .from("location_review_refresh_state")
        .update({
          refresh_enabled: false,
          next_refresh_at: null,
          metadata: {
            taskId: task.id,
            taskStatus: "submitted",
            submittedAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("location_id", locationId)
        .eq("provider", "dataforseo");
      if (updateError) throw new Error(updateError.message);

      results.push({ locationId, submitted: true, taskId: task.id });
    } catch (error) {
      results.push({
        locationId,
        submitted: false,
        error: error instanceof Error ? error.message : "review_refresh_submit_failed",
      });
    }
  }

  return results;
}

export async function collectPendingDataForSeoReviewRefreshes(limit = 25) {
  const scanLimit = Math.max(25, Math.min(500, Math.trunc(limit) * 8));
  const { data, error } = await supabaseAdmin
    .from("location_review_refresh_state")
    .select("*")
    .eq("provider", "dataforseo")
    .eq("refresh_enabled", false)
    .order("updated_at", { ascending: true })
    .limit(scanLimit);
  if (error) throw new Error(`Review task collection queue failed: ${error.message}`);

  const pending = (data || [])
    .filter((row: any) => row.metadata && typeof row.metadata === "object" && row.metadata.taskId)
    .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))));

  const results: Array<Record<string, unknown>> = [];

  for (const item of pending as Array<Record<string, any>>) {
    const locationId = String(item.location_id || "");
    const taskId = String(item.metadata?.taskId || "");
    if (!locationId || !taskId) continue;

    try {
      const payload = await getDataForSeoReviewTask(taskId);
      if (!taskReady(payload)) {
        results.push({ locationId, taskId, status: "pending" });
        continue;
      }

      const snapshotId = await storeProviderSnapshot({
        locationId,
        provider: "dataforseo_reviews",
        providerEntityId: taskId,
        payload,
      });

      const reviews = extractReviewItems(payload);
      const rows: Array<{
        location_id: string;
        provider: string;
        external_review_id: string;
        published_at: string | null;
        rating: number | null;
        review_text: string | null;
        author_name: string | null;
        payload: RawReview;
      }> = [];
      for (const review of reviews) {
        const reviewId = String(review.review_id || "").trim();
        if (!reviewId) continue;
        rows.push({
          location_id: locationId,
          provider: "dataforseo",
          external_review_id: reviewId,
          published_at: reviewTimestamp(review),
          rating: reviewRating(review),
          review_text: reviewText(review) || null,
          author_name: String(review.profile_name || "").trim() || null,
          payload: review,
        });
      }

      if (rows.length) {
        const { error: reviewError } = await supabaseAdmin
          .from("location_external_reviews")
          .upsert(rows, { onConflict: "provider,external_review_id", ignoreDuplicates: true });
        if (reviewError) throw new Error(`External review ingest failed: ${reviewError.message}`);
      }

      const newest = reviews
        .map((review) => ({ id: String(review.review_id || ""), timestamp: reviewTimestamp(review) }))
        .filter((row) => row.id && row.timestamp)
        .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())[0];

      const conceptsUpdated = await refreshReviewIntelligence(locationId);
      const refreshedAt = new Date().toISOString();
      const next = nextReviewRefreshAt({
        popularityScore: Number(item.popularity_score || 0),
        lastRefreshedAt: refreshedAt,
      });

      const { error: stateError } = await supabaseAdmin
        .from("location_review_refresh_state")
        .update({
          last_review_external_id: newest?.id || item.last_review_external_id || null,
          last_review_published_at: newest?.timestamp || item.last_review_published_at || null,
          last_refreshed_at: refreshedAt,
          next_refresh_at: next,
          refresh_enabled: Boolean(next),
          metadata: {
            lastTaskId: taskId,
            taskStatus: "collected",
            collectedAt: refreshedAt,
            snapshotId,
            reviewRowsSeen: reviews.length,
            conceptsUpdated,
          },
          updated_at: refreshedAt,
        })
        .eq("location_id", locationId)
        .eq("provider", "dataforseo");
      if (stateError) throw new Error(stateError.message);

      results.push({
        locationId,
        taskId,
        status: "collected",
        reviewRowsSeen: reviews.length,
        conceptsUpdated,
      });
    } catch (error) {
      results.push({
        locationId,
        taskId,
        status: "failed",
        error: error instanceof Error ? error.message : "review_task_collection_failed",
      });
    }
  }

  return results;
}
