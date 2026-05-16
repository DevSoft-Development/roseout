import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("id, name, restaurant_name, primary_category, cuisine, cuisine_type, food_type, primary_tag, tags, google_types, address, city, state, zip_code, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id")
    .eq("claim_token", token)
    .maybeSingle();

  if (error || !restaurant) {
    return Response.json({ error: "Restaurant not found" }, { status: 404 });
  }

  return Response.json({ restaurant });
}