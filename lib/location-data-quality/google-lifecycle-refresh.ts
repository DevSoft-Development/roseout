import "server-only";

import { getPlaceDetailsNew } from "@/lib/google/places-new-client";
import { supabaseAdmin } from "@/lib/supabase-admin";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const CONCURRENCY = 8;
const DEFAULT_STALE_DAYS = 30;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function run() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

export async function processGoogleLifecycleRefresh(limit = DEFAULT_LIMIT, staleDays = DEFAULT_STALE_DAYS) {
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit || DEFAULT_LIMIT)));
  const safeStaleDays = Math.min(365, Math.max(1, Math.floor(staleDays || DEFAULT_STALE_DAYS)));
  const cutoff = new Date(Date.now() - safeStaleDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,google_place_id,is_searchable,is_hidden,google_business_status,google_business_status_checked_at")
    .is("deleted_at", null)
    .is("duplicate_of", null)
    .not("google_place_id", "is", null)
    .or(`google_business_status.is.null,google_business_status_checked_at.is.null,google_business_status_checked_at.lt.${cutoff}`)
    .order("is_searchable", { ascending: false })
    .order("google_business_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(safeLimit);

  if (error) throw new Error(`Google lifecycle candidate read failed: ${error.message}`);
  const rows = data || [];

  const outcomes = await mapConcurrent(rows, CONCURRENCY, async (row) => {
    const placeId = clean(row.google_place_id);
    if (!placeId) return { id: row.id, status: "skipped" as const, reason: "missing_place_id" };

    try {
      const place = await getPlaceDetailsNew(placeId) as unknown as Record<string, unknown>;
      const businessStatus = clean(place.businessStatus) || "BUSINESS_STATUS_UNSPECIFIED";
      const movedPlace = clean(place.movedPlace) || null;
      const movedPlaceId = clean(place.movedPlaceId) || null;
      const checkedAt = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from("locations")
        .update({
          google_business_status: businessStatus,
          google_business_status_checked_at: checkedAt,
          google_moved_place: movedPlace,
          google_moved_place_id: movedPlaceId,
        })
        .eq("id", row.id)
        .eq("google_place_id", placeId);

      if (updateError) throw new Error(`Lifecycle update failed: ${updateError.message}`);
      return {
        id: row.id,
        status: "updated" as const,
        businessStatus,
        moved: Boolean(movedPlace || movedPlaceId),
      };
    } catch (refreshError) {
      return {
        id: row.id,
        status: "failed" as const,
        reason: refreshError instanceof Error ? refreshError.message : String(refreshError),
      };
    }
  });

  const updated = outcomes.filter((outcome) => outcome.status === "updated");
  const failed = outcomes.filter((outcome) => outcome.status === "failed");
  const moved = updated.filter((outcome) => "moved" in outcome && outcome.moved).length;
  const permanentlyClosed = updated.filter((outcome) => "businessStatus" in outcome && outcome.businessStatus === "CLOSED_PERMANENTLY").length;
  const temporarilyClosed = updated.filter((outcome) => "businessStatus" in outcome && outcome.businessStatus === "CLOSED_TEMPORARILY").length;

  return {
    success: true,
    scanned: rows.length,
    updated: updated.length,
    failed: failed.length,
    moved,
    permanentlyClosed,
    temporarilyClosed,
    staleDays: safeStaleDays,
    failures: failed.slice(0, 20),
  };
}
