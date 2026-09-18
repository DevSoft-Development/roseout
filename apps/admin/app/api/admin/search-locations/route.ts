import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "editor", "reviewer", "viewer"]);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") || "").trim().slice(0, 100);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 20), 1), 50);
  if (q.length < 2) return Response.json({ locations: [] });
  const safe = q.replace(/[%_,()]/g, " ");
  const { data, error } = await getAdminDatabaseClient()
    .from("locations")
    .select("id,name,restaurant_name,activity_name,address,city,state,borough,neighborhood,location_type")
    .or(`name.ilike.%${safe}%,restaurant_name.ilike.%${safe}%,activity_name.ilike.%${safe}%,address.ilike.%${safe}%,city.ilike.%${safe}%`)
    .limit(limit);
  if (error) return Response.json({ error: error.message, locations: [] }, { status: 500 });
  return Response.json({ locations: (data || []).map((row) => ({
    id: row.id,
    name: row.name || row.restaurant_name || row.activity_name || "Unnamed location",
    type: row.location_type || "location",
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    borough: row.borough || "",
    neighborhood: row.neighborhood || "",
  })) });
}
