import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function numberFrom(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function getPhotoBacklog() {
  const [restaurants, activities] = await Promise.all([
    supabaseAdmin
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("image_status", "failed")
      .not("google_place_id", "is", null),
    supabaseAdmin
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("image_status", "failed")
      .not("google_place_id", "is", null),
  ]);

  if (restaurants.error) throw new Error(`Restaurant photo backlog: ${restaurants.error.message}`);
  if (activities.error) throw new Error(`Activity photo backlog: ${activities.error.message}`);

  const restaurantCount = restaurants.count || 0;
  const activityCount = activities.count || 0;

  return {
    total: restaurantCount + activityCount,
    restaurants: restaurantCount,
    activities: activityCount,
  };
}

export async function GET() {
  const [{ data, error }, photoBacklogResult] = await Promise.all([
    supabaseAdmin
      .from("import_logs")
      .select("id, job_name, run_date, created_at, meta, error")
      .order("created_at", { ascending: false })
      .limit(100),
    getPhotoBacklog().then((value) => ({ value, error: null as string | null })).catch((error) => ({
      value: { total: 0, restaurants: 0, activities: 0 },
      error: error instanceof Error ? error.message : String(error),
    })),
  ]);

  if (error) {
    return NextResponse.json({ success: false, error: error.message, logs: [] }, { status: 500 });
  }

  const logs = (data || []).map((row) => {
    const meta = recordFrom(row.meta);
    const imported = numberFrom(meta.inserted_count ?? meta.imported_count ?? meta.imported);
    const duplicates = numberFrom(meta.duplicate_count ?? meta.duplicates ?? meta.skipped_duplicate);
    const photoFailures = numberFrom(meta.image_cache_failed_count);
    const storedFailureTotal = numberFrom(meta.failed_count ?? meta.failed);
    const importFailures = meta.import_failed_count !== undefined
      ? numberFrom(meta.import_failed_count)
      : Math.max(0, storedFailureTotal - photoFailures);
    const failureTotal = meta.failed_count !== undefined || meta.failed !== undefined
      ? storedFailureTotal
      : importFailures + photoFailures;

    return {
      ...row,
      status: meta.run_status ?? meta.status ?? (row.error ? "failed" : "successful"),
      run_status: meta.run_status ?? meta.status ?? (row.error ? "failed" : "successful"),
      market: meta.market ?? meta.requested_market ?? null,
      checked_count: numberFrom(meta.checked_count ?? meta.checked),
      inserted_count: imported,
      imported_count: imported,
      updated_count: numberFrom(meta.updated_count ?? meta.updated),
      skipped_count: numberFrom(meta.skipped_count ?? meta.skipped),
      duplicate_count: duplicates,
      import_failed_count: importFailures,
      image_cache_failed_count: photoFailures,
      failed_count: failureTotal,
      hours_saved_count: numberFrom(meta.hours_saved_count),
      reservation_count: numberFrom(meta.reservation_count),
      images_cached_count: numberFrom(meta.images_cached_count),
      profiles_queued_count: numberFrom(meta.profiles_queued_count),
      published_count: numberFrom(meta.published_count),
      needs_review_count: numberFrom(meta.needs_review_count),
      failure_reasons: recordFrom(meta.failure_reasons ?? meta.skipped_by_reason),
      market_summary: recordFrom(meta.market_summary ?? meta.imported_by_market),
      enrichment_summary: recordFrom(meta.enrichment_summary),
      image_cache_errors: Array.isArray(meta.image_cache_errors) ? meta.image_cache_errors : [],
    };
  });

  return NextResponse.json({
    success: true,
    logs,
    photo_backlog_count: photoBacklogResult.value.total,
    photo_backlog: photoBacklogResult.value,
    photo_backlog_error: photoBacklogResult.error,
  });
}
