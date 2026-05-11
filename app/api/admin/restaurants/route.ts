import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClaimQr } from "@/lib/claimQr";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
    },
  }
);

export async function GET() {
  const { error } = await requireAdminApiRole(["superuser", "admin"]);

  if (error) return error;

  const { data, error: fetchError } = await supabaseAdmin
    .from("restaurants")
    .select("*")
    .order("created_at", { ascending: false });

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  return NextResponse.json({ restaurants: data || [] });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdminApiRole(["superuser", "admin"]);

  if (error) return error;

  try {
    const body = await request.json();

    if (!body.restaurant_name) {
      return NextResponse.json(
        { error: "Restaurant name is required." },
        { status: 400 }
      );
    }

    const claimQr = await createClaimQr("restaurant");

    const { data, error: insertError } = await supabaseAdmin
      .from("restaurants")
      .insert({
        restaurant_name: body.restaurant_name,
        cuisine_type: body.cuisine_type || null,
        description: body.description || null,
        address: body.address || null,
        city: body.city || null,
        state: body.state || null,
        zip_code: body.zip_code || null,
        phone: body.phone || null,
        website: body.website || null,
        reservation_url: body.reservation_url || body.booking_url || body.website || null,
        image_url: body.image_url || null,
        rating: body.rating || 0,
        price_level: body.price_level || null,
        status: body.status || "approved",
        claimed: false,
        ...claimQr,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
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
