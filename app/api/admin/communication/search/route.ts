import { requireAdminApiRole } from "@/lib/admin-api-auth";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export async function GET(request: Request) {
  const { error, supabase } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.communication);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) return Response.json({ users: [], locations: [] });

  const userQuery = supabase.from("profiles").select("id, full_name, email, phone").or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
  const restaurantQuery = supabase.from("restaurants").select("id, name, city, state, contact_email, contact_phone").or(`name.ilike.%${q}%,city.ilike.%${q}%`).limit(8);
  const activityQuery = supabase.from("activities").select("id, name, city, state, contact_email, contact_phone").or(`name.ilike.%${q}%,city.ilike.%${q}%`).limit(8);
  const locationQuery = supabase.from("locations").select("id, name, city, state, type, email, phone").or(`name.ilike.%${q}%,city.ilike.%${q}%`).limit(8);

  const [usersRes, restaurantsRes, activitiesRes, locationsRes] = await Promise.all([userQuery, restaurantQuery, activityQuery, locationQuery]);

  return Response.json({
    users: usersRes.data || [],
    locations: [
      ...(restaurantsRes.data || []).map((item) => ({ ...item, location_type: "restaurant" })),
      ...(activitiesRes.data || []).map((item) => ({ ...item, location_type: "activity" })),
      ...(locationsRes.data || []).map((item) => ({ ...item, location_type: item.type || "location" })),
    ],
  });
}
