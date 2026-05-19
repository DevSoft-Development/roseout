import { NextRequest } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor", "viewer"]);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let restaurants = supabaseAdmin.from("restaurants").select("id,name,restaurant_name,address,city,state,primary_category,cuisine,rating,is_claimed,reservation_link,quality_score,recommendation_score,latitude,longitude,claim_code");
  let activities = supabaseAdmin.from("activities").select("id,name,activity_name,address,city,state,primary_category,activity_type,rating,is_claimed,reservation_link,quality_score,recommendation_score,latitude,longitude,claim_code");
  if (q) {
    restaurants = restaurants.or(`name.ilike.%${q}%,restaurant_name.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%,cuisine.ilike.%${q}%,primary_category.ilike.%${q}%`);
    activities = activities.or(`name.ilike.%${q}%,activity_name.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%,activity_type.ilike.%${q}%,primary_category.ilike.%${q}%`);
  }
  const [r, a] = await Promise.all([restaurants.range(from, to), activities.range(from, to)]);
  return Response.json({ restaurants: r.data || [], activities: a.data || [] });
}
