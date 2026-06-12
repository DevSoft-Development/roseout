import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";
import { firstImage } from "@/lib/locationImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isStorageImage(value: unknown) {
  const url = firstImage(value);
  return Boolean(url && url.includes("/storage/v1/object/public/location-images/"));
}

function needsStorageCache(row: any) {
  if (!row?.google_place_id) return false;

  if (
    isStorageImage(row.main_image) ||
    isStorageImage(row.image_url) ||
    isStorageImage(row.images)
  ) {
    return false;
  }

  return true;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const limit = Math.min(Math.max(Number(body.limit || 10), 1), 50);
    const onlyMissing = body.onlyMissing !== false;

    let query = supabaseAdmin
      .from("locations")
      .select(
        "id,name,restaurant_name,activity_name,address,city,state,google_place_id,main_image,image_url,images,has_photos,photo_status,quality_status,is_searchable,rating,review_count",
      )
      .not("google_place_id", "is", null)
      .order("is_searchable", { ascending: false, nullsFirst: false })
      .order("rating", { ascending: false, nullsFirst: false })
      .order("review_count", { ascending: false, nullsFirst: false })
      .limit(limit * 3);

    if (onlyMissing) {
      query = query.or("main_image.is.null,image_url.is.null,photo_status.neq.storage_cached");
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    const candidates = (data || []).filter(needsStorageCache).slice(0, limit);

    const results = [];

    for (const location of candidates) {
      try {
        const cached = await cacheGooglePlacePhotoToStorage(location);

        const { error: updateError } = await supabaseAdmin
          .from("locations")
          .update({
            main_image: cached.publicUrl,
            image_url: cached.publicUrl,
            images: [cached.publicUrl],
            has_photos: true,
            photo_status: "storage_cached",
            photo_backfill_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", location.id);

        if (updateError) throw updateError;

        results.push({
          id: location.id,
          name: location.name || location.restaurant_name || location.activity_name,
          success: true,
          publicUrl: cached.publicUrl,
          bytes: cached.bytes,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown cache error.";

        await supabaseAdmin
          .from("locations")
          .update({
            photo_backfill_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", location.id);

        results.push({
          id: location.id,
          name: location.name || location.restaurant_name || location.activity_name,
          success: false,
          error: message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      requestedLimit: limit,
      candidateCount: candidates.length,
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Batch Google photo cache failed.",
      },
      { status: 500 },
    );
  }
}
