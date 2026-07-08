import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { updateLocationImageWithCachedUrl } from "@/lib/cacheLocationImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampLimit(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 25;

  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationsEdit);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const limit = clampLimit(body.limit);

    const { data, error } = await supabaseAdmin
      .from("locations")
      .select(
        "id,name,restaurant_name,activity_name,address,city,state,main_image,image_url,images,has_photos,photo_status",
      )
      .or(
        "main_image.ilike.%maps.googleapis.com/maps/api/place/photo%,image_url.ilike.%maps.googleapis.com/maps/api/place/photo%",
      )
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    const results = [];

    for (const location of data || []) {
      const result = await updateLocationImageWithCachedUrl(location);

      results.push({
        id: location.id,
        name: location.name || location.restaurant_name || location.activity_name,
        result,
      });
    }

    return NextResponse.json({
      success: true,
      requestedLimit: limit,
      processed: results.length,
      cached: results.filter((item) => item.result?.cached).length,
      skipped: results.filter((item) => ("skipped" in item.result && item.result.skipped)).length,
      failed: results.filter(
        (item) => !item.result?.cached && !("skipped" in item.result && item.result.skipped),
      ).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Image batch cache failed.",
      },
      { status: 500 },
    );
  }
}
