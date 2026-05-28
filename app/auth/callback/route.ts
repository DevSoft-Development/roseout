import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getLoginDestination, type SupabaseLike } from "@/lib/auth/get-login-destination";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";

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
    return NextResponse.redirect(`${siteUrl}/login`);
  }

  const responseCookies: Parameters<NextResponse["cookies"]["set"]>[] = [];
  const response = NextResponse.redirect(`${siteUrl}/create`);

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
            responseCookies.push([name, value, options]);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${siteUrl}/login`);
  }

  const redirectTarget = await getLoginDestination(supabaseAdmin as unknown as SupabaseLike, data.user, intendedPath);
  const redirectResponse = NextResponse.redirect(`${siteUrl}${redirectTarget}`);
  responseCookies.forEach((cookie) => redirectResponse.cookies.set(...cookie));

  return redirectResponse;
}
