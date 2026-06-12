import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";
import { firstImage } from "@/lib/locationImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_SAFE_DURATION_MS = 270_000;

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

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function cacheOneLocation(location: any) {
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

    return {
      id: location.id,
      name: location.name || location.restaurant_name || location.activity_name,
      success: true,
      publicUrl: cached.publicUrl,
      bytes: cached.bytes,
    };
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

    return {
      id: location.id,
      name: location.name || location.restaurant_name || location.activity_name,
      success: false,
      error: message,
    };
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const body = await request.json().catch(() => ({}));

    const limit = Math.min(Math.max(Number(body.limit || 250), 1), 300);
    const concurrency = Math.min(Math.max(Number(body.concurrency || 8), 1), 8);
    const includeResults = body.includeResults === true;

    const query = supabaseAdmin
      .from("locations")
      .select(
        "id,name,restaurant_name,activity_name,address,city,state,google_place_id,main_image,image_url,images,has_photos,photo_status,quality_status,is_searchable,rating,review_count",
      )
      .not("google_place_id", "is", null)
      .order("photo_status", { ascending: true, nullsFirst: true })
      .order("is_searchable", { ascending: false, nullsFirst: false })
      .order("rating", { ascending: false, nullsFirst: false })
      .order("review_count", { ascending: false, nullsFirst: false })
      .limit(Math.min(limit * 8, 2000));

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    const fetchedRows = data || [];
    const needsCacheRows = fetchedRows.filter(needsStorageCache);
    const candidates = needsCacheRows.slice(0, limit);
    const chunks = chunkArray(candidates, concurrency);

    const results: any[] = [];
    let stoppedEarly = false;

    for (const chunk of chunks) {
      if (Date.now() - startedAt > MAX_SAFE_DURATION_MS) {
        stoppedEarly = true;
        break;
      }

      const chunkResults = await Promise.all(
        chunk.map((location) => cacheOneLocation(location)),
      );

      results.push(...chunkResults);
    }

    const durationMs = Date.now() - startedAt;
    const failures = results.filter((r) => !r.success);

    return NextResponse.json({
      success: true,
      requestedLimit: limit,
      concurrency,
      fetchedCount: fetchedRows.length,
      needsCacheCount: needsCacheRows.length,
      candidateCount: candidates.length,
      processedCount: results.length,
      successCount: results.filter((r) => r.success).length,
      failureCount: failures.length,
      stoppedEarly,
      durationMs,
      failures: failures.slice(0, 10),
      results: includeResults ? results : undefined,
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
