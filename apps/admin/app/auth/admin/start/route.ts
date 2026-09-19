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
  const requestUrl = new URL(request.url);
  const origin = resolveWebSurfaceAuthOrigin(request, requestUrl, "admin");
  const requestedNext = sanitizeIntendedPath(requestUrl.searchParams.get("next"));
  const next = requestedNext?.startsWith("/admin") ? requestedNext : "/admin/dashboard";

  try {
    const callback = new URL("/auth/admin/callback", origin);
    callback.searchParams.set("next", next);

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

    return NextResponse.redirect(data.url);
  } catch (error) {
    console.error("ADMIN_MICROSOFT_OAUTH_START_EXCEPTION", error);
    return loginError(request, requestUrl);
  }
}
