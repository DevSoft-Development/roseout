import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncActivityToLocation, syncRestaurantToLocation } from "@/lib/sync-location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET
  ) {
    return null;
  }
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  return error;
}

async function getFailedRows(table: "restaurants" | "activities", limit: number) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("*")
    .eq("image_status", "failed")
    .not("google_place_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function getRemainingBacklog() {
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

  if (restaurants.error) throw new Error(`restaurants: ${restaurants.error.message}`);
  if (activities.error) throw new Error(`activities: ${activities.error.message}`);

  const restaurantCount = restaurants.count || 0;
  const activityCount = activities.count || 0;
  return {
    total: restaurantCount + activityCount,
    restaurants: restaurantCount,
    activities: activityCount,
  };
}

async function repairRow(table: "restaurants" | "activities", row: Record<string, any>) {
  const id = String(row.id || "");
  if (!id) throw new Error("Location id is missing.");

  const stored = await cacheGooglePlacePhotoToStorage({
    id,
    name: row.name,
    restaurant_name: row.restaurant_name,
    activity_name: row.activity_name,
    google_place_id: row.google_place_id,
  });

  const { data: updatedRow, error: updateError } = await supabaseAdmin
    .from(table)
    .update({
      image_url: stored.publicUrl,
      main_image: stored.publicUrl,
      image_storage_path: stored.objectPath,
      image_status: "cached",
      image_cached_at: new Date().toISOString(),
      photo_status: "google_photo",
      import_last_error: null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !updatedRow) {
    throw new Error(updateError?.message || "Photo metadata was not saved.");
  }

  if (table === "activities") {
    await syncActivityToLocation(updatedRow as Record<string, unknown> & { id: string | number });
  } else {
    await syncRestaurantToLocation(updatedRow as Record<string, unknown> & { id: string | number });
  }

  return { id, name: row.name || row.restaurant_name || row.activity_name || id };
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth) return auth;

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);

  try {
    const [restaurants, activities] = await Promise.all([
      getFailedRows("restaurants", limit),
      getFailedRows("activities", limit),
    ]);

    const candidates = [
      ...restaurants.map((row) => ({ table: "restaurants" as const, row })),
      ...activities.map((row) => ({ table: "activities" as const, row })),
    ]
      .sort((a, b) => new Date(b.row.created_at || 0).getTime() - new Date(a.row.created_at || 0).getTime())
      .slice(0, limit);

    let repaired = 0;
    let failed = 0;
    const repairedLocations: Array<{ id: string; name: string }> = [];
    const errors: string[] = [];

    for (const candidate of candidates) {
      try {
        const repairedLocation = await repairRow(candidate.table, candidate.row);
        repaired += 1;
        repairedLocations.push(repairedLocation);
      } catch (error) {
        failed += 1;
        const message = `${candidate.row.name || candidate.row.id}: ${getErrorMessage(error)}`;
        errors.push(message);
        await supabaseAdmin
          .from(candidate.table)
          .update({ image_status: "failed", import_last_error: message })
          .eq("id", candidate.row.id);
      }
    }

    const remaining = await getRemainingBacklog();

    return NextResponse.json({
      success: failed === 0,
      found: candidates.length,
      processed: candidates.length,
      repaired,
      failed,
      remaining: remaining.total,
      remaining_by_type: remaining,
      hasMore: remaining.total > 0,
      repairedLocations,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, found: 0, processed: 0, repaired: 0, failed: 1, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
