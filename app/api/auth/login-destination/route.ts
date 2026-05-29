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

    console.error("login-destination token lookup failed", {
      message: error?.message ?? null,
    });
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
    reason: error?.message || "no_authenticated_user",
  };
}

async function safeMaybeSingle(
  table: string,
  columns: string,
  column: string,
  value: string,
): Promise<{ data: any; error: any }> {
  try {
    return await supabaseAdmin
      .from(table)
      .select(columns)
      .eq(column, value)
      .maybeSingle();
  } catch (error) {
    console.error("safeMaybeSingle failed", { table, column, error });
    return { data: null, error };
  }
}

async function safeLimitOne(
  table: string,
  column: string,
  value: string,
): Promise<{ data: any[] | null; error: any }> {
  try {
    return await supabaseAdmin
      .from(table)
      .select("id")
      .eq(column, value)
      .limit(1);
  } catch (error) {
    console.error("safeLimitOne failed", { table, column, error });
    return { data: [], error };
  }
}

export async function GET(request: Request) {
  const { user, reason } = await getUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json(
      {
        redirectTo: "/signup",
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
    safeMaybeSingle("user_profiles", "role, account_type", "id", user.id),
    safeLimitOne("locations", "owner_user_id", user.id),
    safeLimitOne("restaurants", "owner_user_id", user.id),
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
      profileError: profileResult.error ? String(profileResult.error) : null,
      locationsError: locationsResult.error ? String(locationsResult.error) : null,
      restaurantsError: restaurantsResult.error ? String(restaurantsResult.error) : null,
    },
  });
}
