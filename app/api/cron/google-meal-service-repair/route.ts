import { fetchGoogleMealPeriods } from "@/lib/google/meal-service";
import { enqueueLocationSearchProfileRefresh } from "@/lib/search/profile/profileRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 10;
const STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
const SUPPRESSED_REVIEW_REASONS = new Set([
  "hidden_inactive_eligibility_conflict",
  "unsupported_non_outing",
]);

async function runWorker(request: Request) {
  const supplied = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || supplied !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("location_search_profiles")
      .select("location_id,review_reasons")
      .eq("needs_review", true)
      .contains("review_reasons", ["cafe_dinner_conflict"])
      .limit(100);

    if (profileError) throw new Error(`Meal-service profile lookup failed: ${profileError.message}`);

    const actionableProfiles = (profiles || []).filter((row) => {
      const reasons = Array.isArray(row.review_reasons)
        ? row.review_reasons.map(String)
        : [];
      return !reasons.some((reason) => SUPPRESSED_REVIEW_REASONS.has(reason));
    });
    const locationIds = [...new Set(actionableProfiles.map((row) => String(row.location_id)).filter(Boolean))];
    if (!locationIds.length) {
      return NextResponse.json({ ok: true, eligible: 0, processed: 0, refreshed: 0, failed: 0 });
    }

    const { data: locations, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id,google_place_id,google_meal_service_checked_at")
      .in("id", locationIds);

    if (locationError) throw new Error(`Meal-service location lookup failed: ${locationError.message}`);

    const staleBefore = Date.now() - STALE_AFTER_MS;
    const eligible = (locations || [])
      .filter((row) => {
        const checkedAt = row.google_meal_service_checked_at
          ? Date.parse(String(row.google_meal_service_checked_at))
          : Number.NaN;
        return !Number.isFinite(checkedAt) || checkedAt < staleBefore;
      })
      .slice(0, BATCH_SIZE);

    const results = await Promise.allSettled(
      eligible.map(async (row) => {
        const locationId = String(row.id);
        const checkedAt = new Date().toISOString();
        const placeId = typeof row.google_place_id === "string" ? row.google_place_id.trim() : "";

        if (!placeId) {
          const { error } = await supabaseAdmin
            .from("locations")
            .update({
              google_meal_periods: [],
              google_meal_service_checked_at: checkedAt,
              google_meal_service_error: "missing_google_place_id",
            })
            .eq("id", locationId);
          if (error) throw new Error(`Meal-service missing-id write failed: ${error.message}`);
          return { locationId, refreshed: false, periods: [] as string[], reason: "missing_google_place_id" };
        }

        try {
          const periods = await fetchGoogleMealPeriods(placeId);
          const { error } = await supabaseAdmin
            .from("locations")
            .update({
              google_meal_periods: periods,
              google_meal_service_checked_at: checkedAt,
              google_meal_service_error: null,
            })
            .eq("id", locationId);
          if (error) throw new Error(`Meal-service write failed: ${error.message}`);

          await enqueueLocationSearchProfileRefresh(locationId, "google_meal_service_evidence");
          return { locationId, refreshed: true, periods };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await supabaseAdmin
            .from("locations")
            .update({
              google_meal_service_checked_at: checkedAt,
              google_meal_service_error: message.slice(0, 1000),
            })
            .eq("id", locationId);
          throw error;
        }
      }),
    );

    const succeeded = results.filter((result) => result.status === "fulfilled");
    const failed = results.filter((result) => result.status === "rejected");
    const refreshed = succeeded.filter(
      (result) => result.status === "fulfilled" && result.value.refreshed,
    ).length;

    return NextResponse.json({
      ok: failed.length === 0,
      eligible: eligible.length,
      processed: results.length,
      refreshed,
      failed: failed.length,
      results: succeeded.map((result) => result.status === "fulfilled" ? result.value : null),
      errors: failed.map((result) => result.status === "rejected" ? String(result.reason) : null),
    }, { status: failed.length ? 207 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meal-service worker failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return runWorker(request);
}

export async function POST(request: Request) {
  return runWorker(request);
}
