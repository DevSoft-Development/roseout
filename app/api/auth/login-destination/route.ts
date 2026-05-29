import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolvePostLoginRedirect, sanitizeIntendedPath } from "@/lib/auth-redirect";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";

export const dynamic = "force-dynamic";

type AuthUserForRedirect = {
  id: string;
  email?: string | null;
};

async function getUserFromRequest(request: Request): Promise<{
  user: AuthUserForRedirect | null;
  reason?: string;
}> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (token) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (!error && data.user?.id) {
      return {
        user: {
          id: data.user.id,
          email: data.user.email ?? null,
        },
      };
    }
  }

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!error && user?.id) {
    return {
      user: {
        id: user.id,
        email: user.email ?? null,
      },
    };
  }

  return {
    user: null,
    reason: "no_authenticated_user",
  };
}

export async function GET(request: Request) {
  const { user, reason } = await getUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json(
      {
        redirectTo: "/login",
        adminRole: null,
        reason: reason || "no_authenticated_user",
      },
      { status: 401 },
    );
  }

  const requestUrl = new URL(request.url);
  const intendedPath = sanitizeIntendedPath(requestUrl.searchParams.get("next"));

  const adminRole = await getAdminLoginRole(supabaseAdmin as any, {
    id: user.id,
    email: user.email ?? null,
  });

  const [profileResult, locationsResult, restaurantsResult] = await Promise.all([
    supabaseAdmin
      .from("user_profiles")
      .select("role, account_type")
      .eq("id", user.id)
      .maybeSingle(),

    supabaseAdmin
      .from("locations")
      .select("id")
      .eq("owner_user_id", user.id)
      .limit(1),

    supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("owner_user_id", user.id)
      .limit(1),
  ]);

  const isLocationOwner =
    Boolean(locationsResult.data?.length) ||
    Boolean(restaurantsResult.data?.length);

  const redirectTo = resolvePostLoginRedirect({
    adminRole,
    role: null,
    profileRole: profileResult.data?.role || null,
    profileAccountType: profileResult.data?.account_type || null,
    isAdminUser: Boolean(adminRole),
    isLocationOwner,
    intendedPath,
  });

  return NextResponse.json({
    redirectTo,
    adminRole,
    userId: user.id,
    email: user.email ?? null,
    profileRole: profileResult.data?.role ?? null,
    profileAccountType: profileResult.data?.account_type ?? null,
    isLocationOwner,
    debug: {
      profileError: profileResult.error?.message ?? null,
      locationsError: locationsResult.error?.message ?? null,
      restaurantsError: restaurantsResult.error?.message ?? null,
    },
  });
}
