import { supabase } from "@/lib/supabase";
import { getIsClaimed } from "@/lib/locationClaim";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      token,
      owner_name,
      owner_email,
      owner_phone,
      message,
    } = body;

    if (!token) {
      return Response.json({ error: "Missing token" }, { status: 400 });
    }

    if (!owner_name || !owner_email) {
      return Response.json(
        { error: "Name and email are required." },
        { status: 400 }
      );
    }

    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id")
      .eq("claim_token", token)
      .maybeSingle();

    if (restaurantError || !restaurant) {
      return Response.json({ error: "Invalid claim link." }, { status: 404 });
    }

    if (getIsClaimed(restaurant)) {
      return Response.json(
        { error: "This restaurant has already been claimed." },
        { status: 400 }
      );
    }

    const { error: claimError } = await supabase
      .from("restaurant_claims")
      .insert({
        restaurant_id: restaurant.id,
        owner_name,
        owner_email,
        owner_phone,
        message,
        status: "pending",
      });

    if (claimError) {
      return Response.json({ error: claimError.message }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from("restaurants")
      .update({
        claim_status: "pending",
        claimed_by_email: owner_email,
      })
      .eq("id", restaurant.id);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      message: "Claim submitted.",
    });
  } catch (error: any) {
    return Response.json(
      { error: error.message || "Server error" },
      { status: 500 }
    );
  }
}