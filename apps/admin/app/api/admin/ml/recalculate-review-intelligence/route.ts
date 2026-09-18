import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { aggregateReviewSignals } from "@/lib/ml/reviewIntelligence";
import { authorizeReviewMlRequest } from "@/lib/ml/admin-ml-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REVIEW_SIGNAL_FIELDS = [
  "location_id","status","rating","review_text","verified_visit","verification_source","created_at","approved_at",
  "ai_keywords","ai_sentiment","ai_score_boost","vibe","noise_level","date_night","group_friendly","family_friendly",
  "occasion_fit","service_quality","food_quality","ambiance_quality","best_for","avoid_if"
].join(",");

type ReviewSignalRow = Record<string, unknown> & { location_id?: string | null };

async function authorize(req: NextRequest) { return authorizeReviewMlRequest(req); }

function boundedError(value: unknown) {
  return (value instanceof Error ? value.message : String(value || "Unknown error")).slice(0, 500);
}

export async function recalculateReviewIntelligenceForLocation(locationId: string) {
  const { data, error } = await getAdminDatabaseClient()
    .from("location_reviews")
    .select(REVIEW_SIGNAL_FIELDS)
    .eq("location_id", locationId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const reviews = (data || []) as unknown as ReviewSignalRow[];
  const features = aggregateReviewSignals(reviews);
  const row = { ...features, location_id: locationId, calculated_at: new Date().toISOString() };
  const { error: upsertError } = await getAdminDatabaseClient().from("location_review_ml_features").upsert(row, { onConflict: "location_id" });
  if (upsertError) throw new Error(upsertError.message);
  return row;
}

export async function POST(req: NextRequest) {
  const authError = await authorize(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const locationId = typeof body.locationId === "string" && body.locationId.length <= 80 ? body.locationId : null;
  const dryRun = Boolean(body.dryRun);
  const limit = Math.min(5000, Math.max(1, Number(body.limit || 1000)));
  const daysBack = body.daysBack == null ? null : Math.min(3650, Math.max(1, Number(body.daysBack)));
  const started = new Date().toISOString();
  const errors: string[] = [];
  let runId: string | null = null;

  if (!dryRun) {
    const { data: run } = await getAdminDatabaseClient()
      .from("review_ml_score_runs")
      .insert({ run_type: locationId ? "location" : "manual", started_at: started, metadata: { locationId, daysBack, dryRun, limit } })
      .select("id")
      .single();
    runId = run?.id || null;
  }

  let query = getAdminDatabaseClient()
    .from("location_reviews")
    .select(REVIEW_SIGNAL_FIELDS)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (locationId) query = query.eq("location_id", locationId);
  if (daysBack) query = query.gte("created_at", new Date(Date.now() - daysBack * 864e5).toISOString());

  const { data, error } = await query;
  if (error) errors.push(boundedError(error.message));
  const reviews = (data || []) as unknown as ReviewSignalRow[];

  const byLocation = new Map<string, ReviewSignalRow[]>();
  for (const review of reviews) {
    if (!review.location_id) continue;
    byLocation.set(review.location_id, [...(byLocation.get(review.location_id) || []), review]);
  }

  const rows: any[] = [...byLocation.entries()].map(([id, locationReviews]) => ({
    ...aggregateReviewSignals(locationReviews),
    location_id: id,
    calculated_at: new Date().toISOString(),
  }));

  let updated = 0;
  if (!dryRun && rows.length) {
    const { error: upsertError } = await getAdminDatabaseClient().from("location_review_ml_features").upsert(rows, { onConflict: "location_id" });
    if (upsertError) errors.push(boundedError(upsertError.message));
    else updated = rows.length;
  }

  const status = errors.length ? "completed_with_errors" : "completed";
  if (runId) {
    await getAdminDatabaseClient().from("review_ml_score_runs").update({
      completed_at: new Date().toISOString(),
      status,
      locations_scanned: byLocation.size,
      locations_updated: updated,
      reviews_scanned: reviews.length,
      errors: errors.slice(0, 20),
      metadata: { locationId, daysBack, dryRun, limit },
    }).eq("id", runId);
  }

  return NextResponse.json({
    success: errors.length === 0,
    dryRun,
    locationsScanned: byLocation.size,
    locationsUpdated: updated,
    reviewsScanned: reviews.length,
    errors,
    sample: rows.slice(0, 5).map((r) => ({
      location_id: r.location_id,
      approved_review_count: r.approved_review_count,
      review_quality: r.overall_review_quality_score,
      confidence: r.review_confidence_score,
      summary: r.review_summary,
    })),
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
