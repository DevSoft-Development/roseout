import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createClaimQr } from "@/lib/claimQrServer";
import { normalizeAddressForSave } from "@/lib/address-utils";

type CreatedRestaurant = Record<string, unknown> & {
  claim_url?: string | null;
  qr_code_data_url?: string | null;
};

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locations);
  if (auth.error) return auth.error;
  const supabaseAdmin = getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ restaurants: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationsCreate);
  if (auth.error) return auth.error;
  const supabaseAdmin = getSupabaseAdminClient();
  try {
    const body = await request.json();

    if (!body.restaurant_name) {
      return NextResponse.json(
        { error: "Restaurant name is required." },
        { status: 400 }
      );
    }

    const claimQr = await createClaimQr("restaurant");
    const normalizedAddress = normalizeAddressForSave({
      address: body.address,
      city: body.city,
      state: body.state,
      zip_code: body.zip_code,
    });

    const { data, error } = await supabaseAdmin
      .from("restaurants")
      .insert({
        restaurant_name: body.restaurant_name,
        cuisine: body.cuisine || body.cuisine_type || null,
        cuisine_type: body.cuisine_type || body.cuisine || null,
        description: body.description || null,
        address: normalizedAddress || null,
        city: body.city || null,
        state: body.state || null,
        zip_code: body.zip_code || null,
        neighborhood: body.neighborhood || null,
        latitude: body.latitude === "" || body.latitude === undefined ? null : Number(body.latitude),
        longitude: body.longitude === "" || body.longitude === undefined ? null : Number(body.longitude),
        google_place_id: body.google_place_id || null,
        formatted_address: body.formatted_address || null,
        phone: body.phone || null,
        website: body.website || null,
        reservation_url: body.reservation_url || body.website || null,
        image_url: body.image_url || null,
        rating: body.rating || 0,
        price_level: body.price_level || null,
        status: body.status || "approved",
        is_claimed: false,
        claimed: false,
        ...claimQr,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const restaurant = data as CreatedRestaurant;

    return NextResponse.json({
      success: true,
      restaurant,
      claim_url: restaurant.claim_url ?? null,
      qr_code_data_url: restaurant.qr_code_data_url ?? null,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create restaurant." },
      { status: 500 }
    );
  }
}
