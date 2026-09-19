import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@theouthaven/auth/server-client";
import { sanitizeIntendedPath } from "@theouthaven/auth/redirect";
import { resolveWebSurfaceAuthOrigin } from "@theouthaven/config/web-surface-origin";

function loginError(request: NextRequest, requestUrl: URL) {
  const origin = resolveWebSurfaceAuthOrigin(request, requestUrl, "admin");
  const url = new URL("/admin/login", origin);
  url.searchParams.set("error", "oauth_failed");
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "Unknown";
  const userAgent = request.headers.get("user-agent") || "Unknown";

  console.info(
    "ADMIN_MICROSOFT_SIGN_IN_ATTEMPT",
    JSON.stringify({
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
      host: request.headers.get("host") || null,
    }),
  );

  const requestUrl = new URL(request.url);
  const origin = resolveWebSurfaceAuthOrigin(request, requestUrl, "admin");
  const requestedNext = sanitizeIntendedPath(requestUrl.searchParams.get("next"));
  const next = requestedNext?.startsWith("/admin") ? requestedNext : "/admin/dashboard";

  try {
    const callback = new URL("/auth/admin/callback", origin);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email",
        redirectTo: callback.toString(),
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      console.error("ADMIN_MICROSOFT_OAUTH_START_FAILED", error || "missing_oauth_url");
      return loginError(request, requestUrl);
    }

    const response = NextResponse.redirect(data.url);
    response.cookies.set("toh_admin_next", next, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("ADMIN_MICROSOFT_OAUTH_START_EXCEPTION", error);
    return loginError(request, requestUrl);
  }
}
