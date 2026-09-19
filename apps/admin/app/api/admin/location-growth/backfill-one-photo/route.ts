import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cacheGooglePlacePhotoToStorage } from "@/lib/location-growth/cacheGooglePhoto";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

function isUsableImage(value: unknown) {
  const url = clean(value);
  if (!url) return false;

  const lower = url.toLowerCase();

  return (
    (url.startsWith("http://") || url.startsWith("https://")) &&
    !lower.includes("placeholder") &&
    !lower.includes("default-image") &&
    !lower.includes("photo-coming-soon") &&
    !lower.includes("photo coming soon") &&
    !lower.includes("no-image")
  );
}

function sanitizeIlike(value: string) {
  return value.replace(/[%*,]/g, "").trim();
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
      const safeName = sanitizeIlike(name);

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

    if (isUsableImage(location.main_image) || isUsableImage(location.image_url)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Location already has a usable image.",
        location_id: location.id,
        name: location.name || location.restaurant_name || location.activity_name,
      });
    }

    const cached = await cacheGooglePlacePhotoToStorage(location);

    const { error: updateError } = await supabaseAdmin
      .from("locations")
      .update({
        main_image: cached.publicUrl,
        image_url: cached.publicUrl,
        images: [cached.publicUrl],
        ...getPhotoPublishabilityUpdates({
          ...location,
          main_image: cached.publicUrl,
          image_url: cached.publicUrl,
          images: [cached.publicUrl],
          photo_status: "storage_cached",
        }),
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
      public_url: cached.publicUrl,
      storage_path: cached.objectPath,
      content_type: cached.contentType,
      bytes: cached.bytes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Photo backfill failed.",
      },
      { status: 500 },
    );
  }
}
