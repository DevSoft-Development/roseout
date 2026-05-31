import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { buildLocationCleanupUpdates } from "@/lib/location-growth/cleanExistingLocations";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const GOOGLE_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") ===
      process.env.IMPORT_SECRET
  )
    return null;
  const { error } = await requireAdminApiRole(["admin", "superadmin"]);
  return error;
}
function text(v: unknown) {
  return String(v || "").trim();
}
function missing(v: unknown) {
  return (
    v == null || text(v).length === 0 || (Array.isArray(v) && v.length === 0)
  );
}
async function googleFind(row: any) {
  if (!GOOGLE_API_KEY) throw new Error("Missing Google Places API key.");
  const input = [
    row.name || row.restaurant_name || row.activity_name,
    row.address,
    row.city,
    row.state,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");
  const findUrl = new URL(
    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
  );
  findUrl.searchParams.set("input", input);
  findUrl.searchParams.set("inputtype", "textquery");
  findUrl.searchParams.set("fields", "place_id");
  findUrl.searchParams.set("key", GOOGLE_API_KEY);
  const findRes = await fetch(findUrl);
  if (!findRes.ok) throw new Error(`Google find failed: ${findRes.status}`);
  const find = await findRes.json();
  const placeId = row.google_place_id || find.candidates?.[0]?.place_id;
  if (!placeId) return null;
  const detailUrl = new URL(
    "https://maps.googleapis.com/maps/api/place/details/json",
  );
  detailUrl.searchParams.set("place_id", placeId);
  detailUrl.searchParams.set(
    "fields",
    "place_id,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,types,geometry,photos",
  );
  detailUrl.searchParams.set("key", GOOGLE_API_KEY);
  const detailsRes = await fetch(detailUrl);
  if (!detailsRes.ok)
    throw new Error(`Google details failed: ${detailsRes.status}`);
  const details = await detailsRes.json();
  return details.result || { place_id: placeId };
}
export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth) return auth;
  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .gte("quality_score", 75)
    .eq("duplicate_status", "unique")
    .in("enrichment_status", ["queued", "not_started", "failed"])
    .order("has_photos", { ascending: true, nullsFirst: true })
    .order("enrichment_priority", { ascending: false })
    .order("rating", { ascending: false, nullsFirst: false })
    .order("quality_score", { ascending: false })
    .order("enrichment_priority", { ascending: false })
    .limit(limit);
  if (error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  let completed = 0;
  let failed = 0;
  for (const row of data || []) {
    try {
      const place = await googleFind(row);
      const updates: Record<string, any> = {
        enrichment_status: "completed",
        last_enriched_at: new Date().toISOString(),
      };
      if (place) {
        if (missing(row.google_place_id) && place.place_id)
          updates.google_place_id = place.place_id;
        if (missing(row.phone))
          updates.phone =
            place.formatted_phone_number ||
            place.international_phone_number ||
            null;
        if (missing(row.website) && place.website)
          updates.website = place.website;
        if (missing(row.rating) && place.rating) updates.rating = place.rating;
        if (missing(row.review_count) && place.user_ratings_total)
          updates.review_count = place.user_ratings_total;
        if (missing(row.google_types) && place.types)
          updates.google_types = place.types;
        if (missing(row.latitude) && place.geometry?.location?.lat)
          updates.latitude = place.geometry.location.lat;
        if (missing(row.longitude) && place.geometry?.location?.lng)
          updates.longitude = place.geometry.location.lng;
        const photoRef = place.photos?.[0]?.photo_reference;
        if (missing(row.main_image) && photoRef)
          updates.main_image = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${encodeURIComponent(photoRef)}&key=${encodeURIComponent(GOOGLE_API_KEY || "")}`;
        if (photoRef) {
          updates.has_photos = true;
          updates.photo_status = "google_photo";
        }
      }
      const recalculated = buildLocationCleanupUpdates({ ...row, ...updates });
      Object.assign(
        updates,
        recalculated,
        place?.photos?.[0]?.photo_reference
          ? { has_photos: true, photo_status: "google_photo" }
          : {},
      );
      const { error: updateError } = await supabaseAdmin
        .from("locations")
        .update(updates)
        .eq("id", row.id);
      if (updateError) throw updateError;
      completed += 1;
    } catch (error) {
      failed += 1;
      await supabaseAdmin
        .from("locations")
        .update({
          enrichment_status: "failed",
          last_enriched_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }
  return NextResponse.json({
    success: true,
    processed: data?.length || 0,
    completed,
    failed,
  });
}
