import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClaimQr } from "@/lib/claimQrServer";
import { normalizeAddressForSave } from "@/lib/address-utils";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
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

    return NextResponse.json({
      success: true,
      restaurant: data,
      claim_url: data.claim_url,
      qr_code_data_url: data.qr_code_data_url,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create restaurant." },
      { status: 500 }
    );
  }
}
