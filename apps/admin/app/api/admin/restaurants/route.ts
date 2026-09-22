import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { RESTAURANT_ADMIN_FIELDS } from "@/lib/admin/location-data-projections";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createClaimQr } from "@/lib/claimQrServer";
import { normalizeAddressForSave } from "@/lib/address-utils";

const bounded = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locations);
  if (auth.error) return auth.error;
  const supabaseAdmin = getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.from("restaurants").select(RESTAURANT_ADMIN_FIELDS).order("created_at", { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ restaurants: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationsCreate);
  if (auth.error) return auth.error;
  const supabaseAdmin = getSupabaseAdminClient();
  try {
    const body = await request.json().catch(() => ({}));
    const restaurantName = bounded(body.restaurant_name, 200);
    if (!restaurantName) return NextResponse.json({ error: "Restaurant name is required." }, { status: 400 });
    const claimQr = await createClaimQr("restaurant");
    const normalizedAddress = normalizeAddressForSave({ address: bounded(body.address, 500), city: bounded(body.city, 120), state: bounded(body.state, 40), zip_code: bounded(body.zip_code, 20) });
    const latitude = body.latitude === "" || body.latitude === undefined ? null : Number(body.latitude);
    const longitude = body.longitude === "" || body.longitude === undefined ? null : Number(body.longitude);
    if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) return NextResponse.json({ error: "Latitude and longitude must be numeric." }, { status: 400 });
    const { data, error } = await supabaseAdmin.from("restaurants").insert({
      restaurant_name: restaurantName,
      cuisine: bounded(body.cuisine || body.cuisine_type, 120) || null,
      cuisine_type: bounded(body.cuisine_type || body.cuisine, 120) || null,
      description: bounded(body.description, 4000) || null,
      address: normalizedAddress || null,
      city: bounded(body.city, 120) || null,
      state: bounded(body.state, 40) || null,
      zip_code: bounded(body.zip_code, 20) || null,
      neighborhood: bounded(body.neighborhood, 120) || null,
      latitude,
      longitude,
      google_place_id: bounded(body.google_place_id, 200) || null,
      formatted_address: bounded(body.formatted_address, 500) || null,
      phone: bounded(body.phone, 40) || null,
      website: bounded(body.website, 1000) || null,
      reservation_url: bounded(body.reservation_url || body.website, 1000) || null,
      image_url: bounded(body.image_url, 1500) || null,
      rating: Number.isFinite(Number(body.rating)) ? Number(body.rating) : 0,
      price_level: bounded(body.price_level, 40) || null,
      status: bounded(body.status, 40) || "approved",
      is_claimed: false,
      claimed: false,
      ...claimQr,
    }).select(RESTAURANT_ADMIN_FIELDS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, restaurant: data, claim_url: data.claim_url, qr_code_data_url: data.qr_code_data_url });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create restaurant." }, { status: 500 });
  }
}
