import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { resolvePostLoginRedirect, sanitizeIntendedPath } from "@/lib/auth-redirect";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";
import {
  resolveWebSurfaceAuthOrigin,
  webSurfaceAuthFallbackPath,
} from "@/lib/web-surface-auth-origin";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const authOrigin = resolveWebSurfaceAuthOrigin(request, requestUrl);
  const fallbackPath = webSurfaceAuthFallbackPath();
  const code = requestUrl.searchParams.get("code");
  const intendedPath = sanitizeIntendedPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL(fallbackPath, authOrigin));
  }

  const cookieResponse = NextResponse.redirect(new URL(fallbackPath, authOrigin));

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
            cookieResponse.cookies.set(name, value, {
              ...options,
              path: "/",
            });
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return cookieResponse;
  }

  const user = data.user;
  const [adminRole, profileResult, locationsResult, restaurantsResult] = await Promise.all([
    getAdminLoginRole(supabaseAdmin as any, {
      id: user.id,
      email: user.email ?? null,
    }),
    supabaseAdmin.from("user_profiles").select("role, account_type").eq("id", user.id).maybeSingle(),
    supabaseAdmin.from("locations").select("id").eq("owner_user_id", user.id).limit(1),
    supabaseAdmin.from("restaurants").select("id").eq("owner_user_id", user.id).limit(1),
  ]);

  const redirectTarget = resolvePostLoginRedirect({
    adminRole,
    role: null,
    profileRole: profileResult.data?.role || null,
    profileAccountType: profileResult.data?.account_type || null,
    isAdminUser: Boolean(adminRole),
    isLocationOwner:
      Boolean(locationsResult.data?.length) ||
      Boolean(restaurantsResult.data?.length),
    intendedPath,
  });

  const finalResponse = NextResponse.redirect(new URL(redirectTarget, authOrigin));
  cookieResponse.cookies.getAll().forEach((cookie) => {
    finalResponse.cookies.set(cookie);
  });
  return finalResponse;
}
