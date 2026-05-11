import { createClient as createServerSupabase } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { User } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ProfileRole = string | null | undefined;

const adminRoleRedirects: Record<string, string> = {
  superuser: "/admin/dashboard",
  admin: "/admin/dashboard",
  editor: "/admin/locations",
  reviewer: "/admin/claims",
  viewer: "/admin/import-history",
};

function isLocationRole(role: ProfileRole) {
  return [
    "location",
    "location_owner",
    "owner",
    "restaurant_owner",
    "restaurants",
  ].includes(String(role || "").toLowerCase());
}

async function hasOwnedLocation(userId: string, email: string | null) {
  const [restaurantsByUser, activitiesByUser] = await Promise.all([
    supabaseAdmin
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", userId),
    supabaseAdmin
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", userId),
  ]);

  if (Number(restaurantsByUser.count || 0) + Number(activitiesByUser.count || 0) > 0) {
    return true;
  }

  if (!email) {
    return false;
  }

  const [restaurantsByEmail, activitiesByEmail] = await Promise.all([
    supabaseAdmin
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("owner_email", email),
    supabaseAdmin
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("owner_email", email),
  ]);

  return (
    Number(restaurantsByEmail.count || 0) + Number(activitiesByEmail.count || 0) >
    0
  );
}

export async function GET(request: Request) {
  const sessionSupabase = await createServerSupabase();
  const {
    data: { user: cookieUser },
  } = await sessionSupabase.auth.getUser();

  let user: User | null = cookieUser;

  if (!user) {
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");

    if (token) {
      const {
        data: { user: tokenUser },
      } = await supabaseAdmin.auth.getUser(token);

      user = tokenUser;
    }
  }

  if (!user) {
    return Response.json(
      { error: "Unauthorized", redirectPath: "/login" },
      { status: 401 }
    );
  }

  const email = user.email?.toLowerCase() || null;
  const authRole = user.user_metadata?.role as ProfileRole;

  if (email) {
    const { data: adminUser } = await supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("email", email)
      .maybeSingle();

    if (adminUser?.role) {
      return Response.json({
        redirectPath: adminRoleRedirects[adminUser.role] || "/admin/dashboard",
      });
    }
  }

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const redirectPath =
    isLocationRole(authRole) ||
    isLocationRole(profile?.role) ||
    (await hasOwnedLocation(user.id, email))
      ? "/locations/dashboard"
      : "/user/dashboard";

  return Response.json({ redirectPath });
}
