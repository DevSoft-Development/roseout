import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";

const rateRules: Array<{ prefix: string; limit: number; windowMs: number }> = [
  { prefix: "/api/auth", limit: 30, windowMs: 60_000 },
  { prefix: "/api/admin/search", limit: 60, windowMs: 60_000 },
  { prefix: "/api/contact", limit: 20, windowMs: 60_000 },
  { prefix: "/api/claim", limit: 20, windowMs: 60_000 },
  { prefix: "/api/business/claim", limit: 20, windowMs: 60_000 },
  { prefix: "/api/business/claim-code", limit: 20, windowMs: 60_000 },
  { prefix: "/api/explore", limit: 60, windowMs: 60_000 },
  { prefix: "/api/generate", limit: 30, windowMs: 60_000 },
  { prefix: "/api/locations/apply", limit: 15, windowMs: 60_000 },
  { prefix: "/api/restaurants/apply", limit: 15, windowMs: 60_000 },
  { prefix: "/api/reservations", limit: 60, windowMs: 60_000 },
  { prefix: "/api/reserve", limit: 60, windowMs: 60_000 },
];

const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{8,20}$/;

function normalizedHostname(request: NextRequest) {
  return (request.headers.get("host") || request.nextUrl.hostname || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function shortLinkHostResponse(request: NextRequest) {
  const configuredHost = String(process.env.SHORT_LINK_HOST || "")
    .trim()
    .toLowerCase();
  if (!configuredHost || normalizedHostname(request) !== configuredHost) return null;

  const pathname = request.nextUrl.pathname;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
  if (pathname === "/") return NextResponse.redirect(siteUrl, 302);

  const code = pathname.replace(/^\/+|\/+$/g, "");
  if (SHORT_CODE_PATTERN.test(code) && !code.includes("/")) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/p/${code}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  return NextResponse.redirect(siteUrl, 302);
}

function isLoadTestBypassAllowed(request: NextRequest) {
  const loadTestSecret = process.env.LOAD_TEST_SECRET;
  const requestLoadTestSecret = request.headers.get("x-load-test-secret");

  if (!loadTestSecret || !requestLoadTestSecret) return false;
  if (requestLoadTestSecret !== loadTestSecret) return false;

  const isProduction = process.env.VERCEL_ENV === "production";
  const allowProductionBypass = process.env.ALLOW_PRODUCTION_LOAD_TEST_BYPASS === "true";

  return !isProduction || allowProductionBypass;
}

export function proxy(request: NextRequest) {
  const shortHostResponse = shortLinkHostResponse(request);
  if (shortHostResponse) return shortHostResponse;

  const pathname = request.nextUrl.pathname;

  const shouldBypassRateLimitForLoadTest =
    pathname.startsWith("/api/generate") && isLoadTestBypassAllowed(request);

  if (shouldBypassRateLimitForLoadTest) return NextResponse.next();

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  for (const rule of rateRules) {
    if (pathname.startsWith(rule.prefix)) {
      const verdict = enforceRateLimit(`${rule.prefix}:${ip}`, rule.limit, rule.windowMs);

      if (!verdict.ok) {
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          {
            status: 429,
            headers: { "Retry-After": String(verdict.retryAfterSeconds || 60) },
          },
        );
      }
    }
  }

  if (pathname.startsWith("/admin")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-theouthaven-admin-pathname", pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/", "/:shortCode"],
};
