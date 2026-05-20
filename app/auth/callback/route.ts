import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getUserMetadataRole, resolvePostLoginRedirect, sanitizeIntendedPath } from "@/lib/auth-redirect";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app";

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const intendedPath = sanitizeIntendedPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/create`);
  }

  let response = NextResponse.redirect(`${siteUrl}/create`);

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

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${siteUrl}/create`);
  }

  const user = data.user;
  const email = user.email?.toLowerCase();

  const [adminUserResult, profileResult, locationsResult, restaurantsResult] = await Promise.all([
    supabaseAdmin.from("admin_users").select("id").eq("email", email || "").maybeSingle(),
    supabaseAdmin.from("user_profiles").select("role, account_type").eq("id", user.id).maybeSingle(),
    supabaseAdmin.from("locations").select("id").eq("owner_user_id", user.id).limit(1),
    supabaseAdmin.from("restaurants").select("id").eq("owner_user_id", user.id).limit(1),
  ]);

  const redirectTarget = resolvePostLoginRedirect({
    role: getUserMetadataRole(user),
    profileRole: profileResult.data?.role || null,
    profileAccountType: profileResult.data?.account_type || null,
    isAdminUser: Boolean(adminUserResult.data),
    isLocationOwner: Boolean(locationsResult.data?.length) || Boolean(restaurantsResult.data?.length),
    intendedPath,
  });

  response = NextResponse.redirect(`${siteUrl}${redirectTarget}`);
  return response;
}
