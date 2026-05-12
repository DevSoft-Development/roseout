import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  DEFAULT_LOGIN_REDIRECT_PATH,
  resolveLoginRedirect,
} from "@/lib/login-redirect";
import { setAppSessionCookie } from "@/lib/app-session";

type CookieToSet = {
  name: string;
  value: string;
  options: Parameters<NextResponse["cookies"]["set"]>[2];
};

function jsonResponse(
  redirectPath: string,
  cookiesToSet: CookieToSet[],
  status = 200
) {
  const response = NextResponse.json(
    { redirectPath },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}

export async function POST(request: NextRequest) {
  const { accessToken, refreshToken, redirectPath: requestedRedirectPath } =
    await request.json().catch(() => ({
      accessToken: "",
      refreshToken: "",
      redirectPath: "",
    }));

  const cookiesToSet: CookieToSet[] = [];

  if (
    !accessToken ||
    !refreshToken ||
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string"
  ) {
    return jsonResponse(DEFAULT_LOGIN_REDIRECT_PATH, cookiesToSet, 401);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(serverCookies) {
          cookiesToSet.push(...serverCookies);
        },
      },
    }
  );

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error || !data.user) {
    return jsonResponse(DEFAULT_LOGIN_REDIRECT_PATH, cookiesToSet, 401);
  }

  const redirectPath = await resolveLoginRedirect(
    data.user,
    typeof requestedRedirectPath === "string" ? requestedRedirectPath : null
  );

  const response = jsonResponse(redirectPath, cookiesToSet);
  setAppSessionCookie(response, data.user);

  return response;
}
