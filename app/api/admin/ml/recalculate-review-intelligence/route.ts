import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { aggregateReviewSignals } from "@/lib/ml/reviewIntelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function bearer(req: NextRequest) { const h = req.headers.get("authorization") || ""; return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null; }
async function authorize(req: NextRequest) { if (process.env.NODE_ENV === "development" || (process.env.CRON_SECRET && bearer(req) === process.env.CRON_SECRET)) return null; const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth); return error; }

export async function recalculateReviewIntelligenceForLocation(locationId: string) {
  const { data, error } = await supabaseAdmin.from("location_reviews").select("*").eq("location_id", locationId).eq("status", "approved").order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  const features = aggregateReviewSignals(data || []);
  const row = { ...features, location_id: locationId, calculated_at: new Date().toISOString() };
  const { error: upsertError } = await supabaseAdmin.from("location_review_ml_features").upsert(row, { onConflict: "location_id" });
  if (upsertError) throw new Error(upsertError.message);
  return row;
}

export async function POST(req: NextRequest) {
  const authError = await authorize(req); if (authError) return authError;
  const body = await req.json().catch(() => ({}));
  const locationId = typeof body.locationId === "string" ? body.locationId : null;
  const dryRun = Boolean(body.dryRun);
  const limit = Math.min(5000, Math.max(1, Number(body.limit || 1000)));
  const daysBack = body.daysBack == null ? null : Math.max(1, Number(body.daysBack));
  const started = new Date().toISOString();
  const errors: string[] = [];
  let runId: string | null = null;
  if (!dryRun) {
    const { data: run } = await supabaseAdmin.from("review_ml_score_runs").insert({ run_type: locationId ? "location" : "manual", started_at: started, metadata: { locationId, daysBack, dryRun, limit } }).select("id").single();
    runId = run?.id || null;
  }
  let query = supabaseAdmin.from("location_reviews").select("*").eq("status", "approved").order("created_at", { ascending: false }).limit(limit);
  if (locationId) query = query.eq("location_id", locationId);
  if (daysBack) query = query.gte("created_at", new Date(Date.now() - daysBack * 864e5).toISOString());
  const { data: reviews, error } = await query;
  if (error) errors.push(error.message);
  const byLocation = new Map<string, any[]>();
  for (const review of reviews || []) if (review.location_id) byLocation.set(review.location_id, [...(byLocation.get(review.location_id) || []), review]);
  const rows: any[] = [...byLocation.entries()].map(([id, rows]) => ({ ...aggregateReviewSignals(rows), location_id: id, calculated_at: new Date().toISOString() }));
  let updated = 0;
  if (!dryRun && rows.length) {
    const { error: upsertError } = await supabaseAdmin.from("location_review_ml_features").upsert(rows, { onConflict: "location_id" });
    if (upsertError) errors.push(upsertError.message); else updated = rows.length;
  }
  const status = errors.length ? "completed_with_errors" : "completed";
  if (runId) await supabaseAdmin.from("review_ml_score_runs").update({ completed_at: new Date().toISOString(), status, locations_scanned: byLocation.size, locations_updated: updated, reviews_scanned: (reviews || []).length, errors, metadata: { locationId, daysBack, dryRun, limit } }).eq("id", runId);
  return NextResponse.json({ success: errors.length === 0, dryRun, locationsScanned: byLocation.size, locationsUpdated: updated, reviewsScanned: (reviews || []).length, errors, sample: rows.slice(0, 5).map((r) => ({ location_id: r.location_id, approved_review_count: r.approved_review_count, review_quality: r.overall_review_quality_score, confidence: r.review_confidence_score, summary: r.review_summary })) });
}
export async function GET(req: NextRequest) { return POST(req); }
