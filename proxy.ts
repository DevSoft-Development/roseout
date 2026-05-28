import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminLoginRole, getLoginDestination, hasVerifiedOwnerAccess, type SupabaseLike } from "@/lib/auth/get-login-destination";

const rateRules: Array<{ prefix: string; limit: number; windowMs: number }> = [
  { prefix: "/api/auth", limit: 30, windowMs: 60_000 },
  { prefix: "/api/admin/search", limit: 60, windowMs: 60_000 },
  { prefix: "/api/contact", limit: 20, windowMs: 60_000 },
  { prefix: "/api/reservations", limit: 60, windowMs: 60_000 },
  { prefix: "/api/reserve", limit: 60, windowMs: 60_000 },
];

function redirectWithCookies(
  request: NextRequest,
  destination: string,
  cookiesToSet: Parameters<NextResponse["cookies"]["set"]>[],
) {
  const response = NextResponse.redirect(new URL(destination, request.url));
  cookiesToSet.forEach((cookie) => response.cookies.set(...cookie));
  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  for (const rule of rateRules) {
    if (pathname.startsWith(rule.prefix)) {
      const verdict = enforceRateLimit(`${rule.prefix}:${ip}`, rule.limit, rule.windowMs);
      if (!verdict.ok) {
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds || 60) } });
      }
    }
  }

  const needsAuthRedirect = pathname === "/login" || pathname === "/signin";
  const needsAdminProtection = pathname === "/admin" || pathname.startsWith("/admin/dashboard");
  const needsOwnerProtection = pathname === "/location-owner" || pathname.startsWith("/location-owner/");

  if (!needsAuthRedirect && !needsAdminProtection && !needsOwnerProtection) {
    return NextResponse.next();
  }

  const cookiesToSet: Parameters<NextResponse["cookies"]["set"]>[] = [];
  const response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(updatedCookies) {
          updatedCookies.forEach(({ name, value, options }) => {
            cookiesToSet.push([name, value, options]);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );
  const roleSupabase = supabase as unknown as SupabaseLike;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (needsAuthRedirect && user) {
    const destination = await getLoginDestination(roleSupabase, user);
    return redirectWithCookies(request, destination, cookiesToSet);
  }

  if (needsAdminProtection) {
    if (!user) {
      return redirectWithCookies(request, `/login?next=${encodeURIComponent(pathname)}`, cookiesToSet);
    }

    const adminRole = await getAdminLoginRole(roleSupabase, user);
    if (!adminRole) {
      return redirectWithCookies(request, "/admin/unauthorized", cookiesToSet);
    }
  }

  if (needsOwnerProtection) {
    if (!user) {
      return redirectWithCookies(request, `/login?next=${encodeURIComponent(pathname)}`, cookiesToSet);
    }

    const adminRole = await getAdminLoginRole(roleSupabase, user);
    const ownerAccess = adminRole ? true : await hasVerifiedOwnerAccess(roleSupabase, user);
    if (!ownerAccess) {
      return redirectWithCookies(request, "/admin/unauthorized", cookiesToSet);
    }
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*", "/login", "/signin", "/admin", "/admin/dashboard/:path*", "/location-owner/:path*"],
};
