import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolvePostLoginRedirect, sanitizeIntendedPath } from "@/lib/auth-redirect";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";

export const dynamic = "force-dynamic";

type AuthUserForRedirect = {
  id: string;
  email?: string | null;
};

type SessionTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type UserResolution = {
  user: AuthUserForRedirect | null;
  reason?: string;
  debug: {
    source: "server_cookies" | "authorization_header" | "synced_session" | "none";
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    attemptedCookieSync: boolean;
    cookieSyncSucceeded: boolean;
    cookieNamesSet: string[];
    setSessionError: string | null;
    getUserError: string | null;
    authHeaderUserError: string | null;
  };
  cookiesToSet: CookieToSet[];
  headersToSet: Record<string, string>;
};

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
}

function getHeaderTokens(request: NextRequest): SessionTokens {
  return {
    accessToken: getBearerToken(request),
    refreshToken: request.headers.get("x-supabase-refresh-token"),
  };
}

async function getBodyTokens(request: NextRequest): Promise<SessionTokens & { intendedPath: string | null }> {
  const fallback = { accessToken: null, refreshToken: null, intendedPath: null };

  try {
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return fallback;
    }

    return {
      accessToken:
        typeof body.accessToken === "string" && body.accessToken.length > 0
          ? body.accessToken
          : null,
      refreshToken:
        typeof body.refreshToken === "string" && body.refreshToken.length > 0
          ? body.refreshToken
          : null,
      intendedPath:
        typeof body.next === "string" ? sanitizeIntendedPath(body.next) : null,
    };
  } catch {
    return fallback;
  }
}

async function getUserFromRequest(
  request: NextRequest,
  tokens: SessionTokens = getHeaderTokens(request),
): Promise<UserResolution> {
  const cookiesToSet: CookieToSet[] = [];
  const headersToSet: Record<string, string> = {};
  const debug: UserResolution["debug"] = {
    source: "none",
    hasAccessToken: Boolean(tokens.accessToken),
    hasRefreshToken: Boolean(tokens.refreshToken),
    attemptedCookieSync: Boolean(tokens.accessToken && tokens.refreshToken),
    cookieSyncSucceeded: false,
    cookieNamesSet: [],
    setSessionError: null,
    getUserError: null,
    authHeaderUserError: null,
  };

  if (tokens.accessToken && tokens.refreshToken) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(nextCookies, headers) {
            cookiesToSet.push(...nextCookies);
            Object.assign(headersToSet, headers);
            debug.cookieNamesSet = Array.from(
              new Set([
                ...debug.cookieNamesSet,
                ...nextCookies.map((cookie) => cookie.name),
              ]),
            );
          },
        },
      },
    );

    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    if (setSessionError) {
      debug.setSessionError = setSessionError.message;
    } else {
      const {
        data: { user },
        error: getUserError,
      } = await supabase.auth.getUser();

      if (getUserError) {
        debug.getUserError = getUserError.message;
      }

      if (!getUserError && user?.id) {
        debug.source = "synced_session";
        debug.cookieSyncSucceeded = cookiesToSet.length > 0;
        return {
          user: {
            id: user.id,
            email: user.email ?? null,
          },
          debug,
          cookiesToSet,
          headersToSet,
        };
      }
    }
  }

  if (tokens.accessToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(tokens.accessToken);

    if (error) {
      debug.authHeaderUserError = error.message;
    }

    if (!error && data.user?.id) {
      debug.source = "authorization_header";
      return {
        user: {
          id: data.user.id,
          email: data.user.email ?? null,
        },
        reason: tokens.refreshToken ? undefined : "missing_refresh_token_for_cookie_sync",
        debug,
        cookiesToSet,
        headersToSet,
      };
    }
  }

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    debug.getUserError = error.message;
  }

  if (!error && user?.id) {
    debug.source = "server_cookies";
    return {
      user: {
        id: user.id,
        email: user.email ?? null,
      },
      debug,
      cookiesToSet,
      headersToSet,
    };
  }

  return {
    user: null,
    reason: tokens.accessToken
      ? "invalid_or_expired_session_tokens"
      : "no_authenticated_user",
    debug,
    cookiesToSet,
    headersToSet,
  };
}

async function resolveDestination(
  request: NextRequest,
  tokens?: SessionTokens,
  intendedPathOverride?: string | null,
) {
  const { user, reason, debug, cookiesToSet, headersToSet } = await getUserFromRequest(
    request,
    tokens,
  );

  console.debug("LOGIN_DESTINATION_AUTH_DEBUG", {
    reason: reason ?? null,
    ...debug,
  });

  if (!user?.id) {
    const response = NextResponse.json(
      {
        redirectTo: "/login",
        adminRole: null,
        reason: reason || "no_authenticated_user",
        debug,
      },
      { status: 401 },
    );
    applyCookieSync(response, cookiesToSet, headersToSet);
    return response;
  }

  const requestUrl = new URL(request.url);
  const intendedPath =
    intendedPathOverride ?? sanitizeIntendedPath(requestUrl.searchParams.get("next"));

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

  console.debug("LOGIN_DESTINATION_RESOLUTION_DEBUG", {
    userId: user.id,
    email: user.email ?? null,
    redirectTo,
    intendedPath,
    adminRole,
    isLocationOwner,
    profileRole: profileResult.data?.role ?? null,
    profileAccountType: profileResult.data?.account_type ?? null,
    cookieSyncSucceeded: debug.cookieSyncSucceeded,
    cookieNamesSet: debug.cookieNamesSet,
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
      ...debug,
      reason: reason ?? null,
      profileError: profileResult.error?.message ?? null,
      locationsError: locationsResult.error?.message ?? null,
      restaurantsError: restaurantsResult.error?.message ?? null,
    },
  });
  applyCookieSync(response, cookiesToSet, headersToSet);
  return response;
}

function applyCookieSync(
  response: NextResponse,
  cookiesToSet: CookieToSet[],
  headersToSet: Record<string, string>,
) {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  Object.entries(headersToSet).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  response.headers.set("Cache-Control", "private, no-store");
}

export async function GET(request: NextRequest) {
  return resolveDestination(request, getHeaderTokens(request));
}

export async function POST(request: NextRequest) {
  const bodyTokens = await getBodyTokens(request);
  const headerTokens = getHeaderTokens(request);

  return resolveDestination(
    request,
    {
      accessToken: bodyTokens.accessToken ?? headerTokens.accessToken,
      refreshToken: bodyTokens.refreshToken ?? headerTokens.refreshToken,
    },
    bodyTokens.intendedPath,
  );
}
