import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }

  const { data: activity, error } = await supabase
    .from("activities")
    .select(
      "id, name, activity_name, activity_type, address, city, state, zip_code, claim_status"
    )
    .eq("claim_token", token)
    .maybeSingle();

  if (error || !activity) {
    return Response.json({ error: "Activity not found" }, { status: 404 });
  }

  return Response.json({ activity });
}