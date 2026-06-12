import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_SAFE_DURATION_MS = 270_000;
const STORAGE_MARKER = "/storage/v1/object/public/location-images/";
const GOOGLE_PHOTO_MARKER = "maps.googleapis.com/maps/api/place/photo";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value || "");
  }
}

function hasStorageImage(value: unknown) {
  return asText(value).includes(STORAGE_MARKER);
}

function hasGooglePhotoUrl(value: unknown) {
  return asText(value).includes(GOOGLE_PHOTO_MARKER);
}

function rowHasAnyStorageImage(row: any) {
  return (
    hasStorageImage(row.main_image) ||
    hasStorageImage(row.image_url) ||
    hasStorageImage(row.images)
  );
}

function rowHasAnyGooglePhotoUrl(row: any) {
  return (
    hasGooglePhotoUrl(row.main_image) ||
    hasGooglePhotoUrl(row.image_url) ||
    hasGooglePhotoUrl(row.images)
  );
}

function needsStorageCache(row: any) {
  if (!row?.google_place_id) return false;
  if (rowHasAnyStorageImage(row)) return false;
  if (rowHasAnyGooglePhotoUrl(row)) return true;

  return true;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function updateLocationWithCachedPhoto(location: any, cached: any) {
  const updatePayload = {
    main_image: cached.publicUrl,
    image_url: cached.publicUrl,
    images: [cached.publicUrl],
    has_photos: true,
    photo_status: "storage_cached",
    photo_backfill_error: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("locations")
    .update(updatePayload)
    .eq("id", location.id);

  if (!error) return;

  if (
    String(error.message || "").includes("updated_at") ||
    String(error.message || "").includes("column")
  ) {
    const { updated_at, ...fallbackPayload } = updatePayload;

    const { error: fallbackError } = await supabaseAdmin
      .from("locations")
      .update(fallbackPayload)
      .eq("id", location.id);

    if (fallbackError) throw fallbackError;
    return;
  }

  throw error;
}

async function updateLocationFailure(location: any, message: string) {
  const updatePayload = {
    photo_backfill_error: message,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("locations")
    .update(updatePayload)
    .eq("id", location.id);

  if (!error) return;

  if (
    String(error.message || "").includes("updated_at") ||
    String(error.message || "").includes("column")
  ) {
    const { updated_at, ...fallbackPayload } = updatePayload;

    await supabaseAdmin
      .from("locations")
      .update(fallbackPayload)
      .eq("id", location.id);
  }
}

async function cacheOneLocation(location: any) {
  try {
    const cached = await cacheGooglePlacePhotoToStorage(location);

    await updateLocationWithCachedPhoto(location, cached);

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

    await updateLocationFailure(location, message);

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

    const limit = Math.min(Math.max(Number(body.limit || 150), 1), 300);
    const concurrency = Math.min(Math.max(Number(body.concurrency || 6), 1), 8);
    const includeResults = body.includeResults === true;

    const { data: googleUrlRows, error: googleUrlError } = await supabaseAdmin
      .from("locations")
      .select(
        "id,name,restaurant_name,activity_name,address,city,state,google_place_id,main_image,image_url,images,has_photos,photo_status,quality_status,is_searchable,rating,review_count",
      )
      .not("google_place_id", "is", null)
      .or(
        [
          "main_image.ilike.%maps.googleapis.com/maps/api/place/photo%",
          "image_url.ilike.%maps.googleapis.com/maps/api/place/photo%",
        ].join(","),
      )
      .order("is_searchable", { ascending: false, nullsFirst: false })
      .order("rating", { ascending: false, nullsFirst: false })
      .order("review_count", { ascending: false, nullsFirst: false })
      .limit(limit * 3);

    if (googleUrlError) {
      return NextResponse.json(
        {
          success: false,
          stage: "google_url_query",
          error: googleUrlError.message,
        },
        { status: 500 },
      );
    }

    let fetchedRows = googleUrlRows || [];

    if (fetchedRows.length === 0) {
      const { data: fallbackRows, error: fallbackError } = await supabaseAdmin
        .from("locations")
        .select(
          "id,name,restaurant_name,activity_name,address,city,state,google_place_id,main_image,image_url,images,has_photos,photo_status,quality_status,is_searchable,rating,review_count,updated_at",
        )
        .not("google_place_id", "is", null)
        .neq("photo_status", "storage_cached")
        .order("updated_at", { ascending: true, nullsFirst: true })
        .limit(2000);

      if (fallbackError) {
        return NextResponse.json(
          {
            success: false,
            stage: "fallback_query",
            error: fallbackError.message,
          },
          { status: 500 },
        );
      }

      fetchedRows = fallbackRows || [];
    }

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

    const failures = results.filter((result) => !result.success);
    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      success: true,
      requestedLimit: limit,
      concurrency,
      fetchedCount: fetchedRows.length,
      needsCacheCount: needsCacheRows.length,
      candidateCount: candidates.length,
      processedCount: results.length,
      successCount: results.filter((result) => result.success).length,
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
