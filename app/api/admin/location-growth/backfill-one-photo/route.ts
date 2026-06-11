import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

async function findGooglePlacePhoto(row: any) {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;

  if (!key) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY or GOOGLE_API_KEY");
  }

  const placeId = clean(row.google_place_id || row.place_id);

  if (!placeId) {
    throw new Error("Location has no google_place_id/place_id");
  }

  const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  detailsUrl.searchParams.set("place_id", placeId);
  detailsUrl.searchParams.set("fields", "photos");
  detailsUrl.searchParams.set("key", key);

  const detailsResponse = await fetch(detailsUrl);
  const details = await detailsResponse.json();

  if (!detailsResponse.ok || details?.status === "REQUEST_DENIED") {
    throw new Error(details?.error_message || "Google Places details request failed");
  }

  const photoReference = details?.result?.photos?.[0]?.photo_reference;

  if (!photoReference) {
    throw new Error("Google returned no photo_reference");
  }

  const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
  photoUrl.searchParams.set("maxwidth", "1200");
  photoUrl.searchParams.set("photo_reference", photoReference);
  photoUrl.searchParams.set("key", key);

  return photoUrl.toString();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const id = clean(body.id);
    const name = clean(body.name);

    if (!id && !name) {
      return NextResponse.json(
        { error: "Pass either id or name." },
        { status: 400 },
      );
    }

    let query = supabaseAdmin
      .from("locations")
      .select(
        "id,name,restaurant_name,activity_name,address,city,state,google_place_id,place_id,main_image,image_url,images,has_photos,photo_status",
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

    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Location not found." },
        { status: 404 },
      );
    }

    if (isUsableImage(data.main_image) || isUsableImage(data.image_url)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Location already has a usable image.",
        location: data,
      });
    }

    const photoUrl = await findGooglePlacePhoto(data);

    const { error: updateError } = await supabaseAdmin
      .from("locations")
      .update({
        main_image: photoUrl,
        image_url: photoUrl,
        has_photos: true,
        photo_status: "google_photo",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      location_id: data.id,
      name: data.name || data.restaurant_name || data.activity_name,
      photo_url: photoUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Photo backfill failed.",
      },
      { status: 500 },
    );
  }
}
