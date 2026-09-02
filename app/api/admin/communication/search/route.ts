import { requireAdminApiRole } from "@/lib/admin-api-auth";
import {
  platformCoreApiConfigured,
  readAdminCommunicationSearchViaCoreApi,
} from "@/lib/aws/core-api";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export async function GET(request: Request) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.communication);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) return Response.json({ users: [], locations: [] });

  if (platformCoreApiConfigured()) {
    try {
      return Response.json(await readAdminCommunicationSearchViaCoreApi(q));
    } catch {
      // Fail open to the existing server-side Supabase path while Core API extraction settles.
    }
  }

  const safeQuery = q.replace(/[%_,()]/g, " ").trim();
  if (safeQuery.length < 2) return Response.json({ users: [], locations: [] });

  const userQuery = supabaseAdmin
    .from("users")
    .select("id, full_name, email, phone")
    .or(`full_name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%`)
    .limit(8);
  const restaurantQuery = supabaseAdmin
    .from("restaurants")
    .select("id, name, city, state, email, phone")
    .or(`name.ilike.%${safeQuery}%,city.ilike.%${safeQuery}%`)
    .limit(8);
  const activityQuery = supabaseAdmin
    .from("activities")
    .select("id, name, city, state, email, phone")
    .or(`name.ilike.%${safeQuery}%,city.ilike.%${safeQuery}%`)
    .limit(8);
  const locationQuery = supabaseAdmin
    .from("locations")
    .select("id, name, city, state, type, owner_email, phone")
    .or(`name.ilike.%${safeQuery}%,city.ilike.%${safeQuery}%`)
    .limit(8);

  const [usersRes, restaurantsRes, activitiesRes, locationsRes] = await Promise.all([
    userQuery,
    restaurantQuery,
    activityQuery,
    locationQuery,
  ]);

  return Response.json({
    users: usersRes.data || [],
    locations: [
      ...(restaurantsRes.data || []).map((item) => ({
        id: item.id,
        name: item.name,
        city: item.city,
        state: item.state,
        contact_email: item.email,
        contact_phone: item.phone,
        location_type: "restaurant",
      })),
      ...(activitiesRes.data || []).map((item) => ({
        id: item.id,
        name: item.name,
        city: item.city,
        state: item.state,
        contact_email: item.email,
        contact_phone: item.phone,
        location_type: "activity",
      })),
      ...(locationsRes.data || []).map((item) => ({
        id: item.id,
        name: item.name,
        city: item.city,
        state: item.state,
        type: item.type,
        email: item.owner_email,
        phone: item.phone,
        location_type: item.type || "location",
      })),
    ],
  });
}
