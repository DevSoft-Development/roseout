import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationImage, firstImage } from "@/lib/locationImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "stk";

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(
      "id,name,restaurant_name,activity_name,address,google_place_id,main_image,image_url,images,has_photos,photo_status,photo_backfill_error",
    )
    .or(`name.ilike.%${q}%,restaurant_name.ilike.%${q}%,activity_name.ilike.%${q}%`)
    .limit(10);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    rows: (data || []).map((row: any) => ({
      id: row.id,
      name: row.name || row.restaurant_name || row.activity_name,
      google_place_id: row.google_place_id,
      main_image: row.main_image,
      image_url: row.image_url,
      images: row.images,
      first_main_image: firstImage(row.main_image),
      first_image_url: firstImage(row.image_url),
      first_images: firstImage(row.images),
      resolved_public_image: getLocationImage(row),
      has_photos: row.has_photos,
      photo_status: row.photo_status,
      photo_backfill_error: row.photo_backfill_error,
    })),
  });
}
