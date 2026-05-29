import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolvePostLoginRedirect, sanitizeIntendedPath } from "@/lib/auth-redirect";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return NextResponse.json(
      {
        redirectTo: "/login",
        adminRole: null,
        reason: "no_authenticated_user",
      },
      { status: 401 },
    );
  }

  const requestUrl = new URL(request.url);
  const intendedPath = sanitizeIntendedPath(requestUrl.searchParams.get("next"));

  const adminRole = await getAdminLoginRole(supabaseAdmin, {
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
    Boolean(locationsResult.data?.length) || Boolean(restaurantsResult.data?.length);

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
  });
}
