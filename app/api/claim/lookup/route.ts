import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("id, name, restaurant_name, address, city, state, zip_code, claim_status")
    .eq("claim_token", token)
    .maybeSingle();

  if (error || !restaurant) {
    return Response.json({ error: "Restaurant not found" }, { status: 404 });
  }

  return Response.json({ restaurant });
}