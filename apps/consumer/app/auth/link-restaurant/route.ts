import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.userId || !body.email) {
      return NextResponse.json(
        { error: "Missing user info." },
        { status: 400 }
      );
    }

    const email = body.email.toLowerCase();

    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (!restaurant) {
      return NextResponse.json(
        { error: "No restaurant found for this email." },
        { status: 404 }
      );
    }

    const { error: updateRestaurantError } = await supabaseAdmin
      .from("restaurants")
      .update({
        owner_user_id: body.userId,
        owner_email: email,
      })
      .eq("id", restaurant.id);

    if (updateRestaurantError) {
      return NextResponse.json(
        { error: updateRestaurantError.message },
        { status: 500 }
      );
    }

    await supabaseAdmin.from("users").upsert(
      {
        id: body.userId,
        email,
        role: "owner",
      },
      { onConflict: "id" },
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Server error." },
      { status: 500 }
    );
  }
}