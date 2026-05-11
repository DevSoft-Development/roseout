import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type ProfileRole = string | null | undefined;

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

const adminRoleRedirects: Record<string, string> = {
  superadmin: "/admin/dashboard",
  superuser: "/admin/dashboard",
  admin: "/admin/dashboard",
  editor: "/admin/dashboard/locations",
  reviewer: "/admin/claims",
  viewer: "/admin/import-history",
};

function normalizeRole(role: ProfileRole) {
  return String(role || "").toLowerCase();
}

function getAdminRedirect(role: ProfileRole) {
  return adminRoleRedirects[normalizeRole(role)] || null;
}

function isLocationRole(role: ProfileRole) {
  return [
    "location",
    "location_owner",
    "owner",
    "restaurant_owner",
    "restaurants",
  ].includes(normalizeRole(role));
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

  if (
    Number(restaurantsByUser.count || 0) +
      Number(activitiesByUser.count || 0) >
    0
  ) {
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

async function resolveRedirectPath(user: User) {
  const email = user.email?.toLowerCase() || null;
  const authRole = user.user_metadata?.role as ProfileRole;
  const appRole = user.app_metadata?.role as ProfileRole;
  const isSuperadmin = Boolean(
    user.user_metadata?.is_superadmin || user.app_metadata?.is_superadmin
  );

  const authAdminRedirect = isSuperadmin
    ? "/admin/dashboard"
    : getAdminRedirect(authRole) || getAdminRedirect(appRole);

  if (authAdminRedirect) {
    return authAdminRedirect;
  }

  if (email) {
    const { data: adminUser } = await supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("email", email)
      .maybeSingle();

    const adminRedirect = getAdminRedirect(adminUser?.role);

    if (adminRedirect) {
      return adminRedirect;
    }
  }

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  const profileAdminRedirect = profile?.is_superadmin
    ? "/admin/dashboard"
    : getAdminRedirect(profile?.role);

  if (profileAdminRedirect) {
    return profileAdminRedirect;
  }

  return isLocationRole(authRole) ||
    isLocationRole(profile?.role) ||
    (await hasOwnedLocation(user.id, email))
    ? "/locations/dashboard"
    : "/user/dashboard";
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

  return Response.json({ redirectPath: await resolveRedirectPath(user) });
}

export async function POST(request: NextRequest) {
  const cookiesToSet: CookieToSet[] = [];
  const headersToSet: Record<string, string> = {};
  const body = (await request.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!body.access_token || !body.refresh_token) {
    return NextResponse.json(
      { error: "Missing session tokens.", redirectPath: "/login" },
      { status: 400 }
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies, headers) {
          cookiesToSet.push(...cookies);
          Object.assign(headersToSet, headers);
        },
      },
    }
  );

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });

  if (sessionError) {
    return NextResponse.json(
      { error: sessionError.message, redirectPath: "/login" },
      { status: 401 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", redirectPath: "/login" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({
    redirectPath: await resolveRedirectPath(user),
  });

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  Object.entries(headersToSet).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}
