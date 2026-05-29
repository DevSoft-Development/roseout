import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolvePostLoginRedirect, sanitizeIntendedPath } from "@/lib/auth-redirect";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";

export const dynamic = "force-dynamic";

type AuthUserForRedirect = {
  id: string;
  email?: string | null;
};

type RequestSessionTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

function getSessionTokensFromRequest(request: Request): RequestSessionTokens {
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const refreshToken = request.headers.get("x-supabase-refresh-token");

  return { accessToken, refreshToken };
}

async function persistSessionCookies(
  request: NextRequest,
  response: NextResponse,
  tokens: RequestSessionTokens,
) {
  if (!tokens.accessToken || !tokens.refreshToken) return;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  if (error) {
    console.error("Login destination session cookie sync failed:", error.message);
  }
}

async function getUserFromRequest(request: Request): Promise<{
  user: AuthUserForRedirect | null;
  reason?: string;
}> {
  const { accessToken } = getSessionTokensFromRequest(request);

  if (accessToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

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

export async function GET(request: NextRequest) {
  const sessionTokens = getSessionTokensFromRequest(request);
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

  const response = NextResponse.json({
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
      sessionCookieSync: Boolean(sessionTokens.accessToken && sessionTokens.refreshToken),
    },
  });

  await persistSessionCookies(request, response, sessionTokens);

  return response;
}
