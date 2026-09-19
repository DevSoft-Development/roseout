import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationsEdit);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));

    const id = clean(body.id);
    const name = clean(body.name);

    if (!id && !name) {
      return NextResponse.json(
        { success: false, error: "Pass either id or name." },
        { status: 400 },
      );
    }

    let query = supabaseAdmin
      .from("locations")
      .select(
        "id,name,restaurant_name,activity_name,address,city,state,google_place_id,main_image,image_url,images,has_photos,photo_status",
      )
      .limit(1);

    if (id) {
      query = query.eq("id", id);
    } else {
      const safeName = name.replace(/[%*,]/g, "").trim();

      query = query.or(
        `name.ilike.%${safeName}%,restaurant_name.ilike.%${safeName}%,activity_name.ilike.%${safeName}%`,
      );
    }

    const { data: location, error } = await query.single();

    if (error || !location) {
      return NextResponse.json(
        { success: false, error: error?.message || "Location not found." },
        { status: 404 },
      );
    }

    const cached = await cacheGooglePlacePhotoToStorage(location);

    const { error: updateError } = await supabaseAdmin
      .from("locations")
      .update({
        main_image: cached.publicUrl,
        image_url: cached.publicUrl,
        images: [cached.publicUrl],
        ...getPhotoPublishabilityUpdates({ ...location, main_image: cached.publicUrl, image_url: cached.publicUrl, images: [cached.publicUrl], photo_status: "storage_cached" }),
        photo_status: "storage_cached",
        photo_backfill_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", location.id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      location_id: location.id,
      name: location.name || location.restaurant_name || location.activity_name,
      publicUrl: cached.publicUrl,
      objectPath: cached.objectPath,
      contentType: cached.contentType,
      bytes: cached.bytes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Google photo cache failed.",
      },
      { status: 500 },
    );
  }
}
