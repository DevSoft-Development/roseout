import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{8,20}$/;

function normalizedHostname(request: NextRequest) {
  return (
    request.headers.get("x-theouthaven-original-host") ||
    request.headers.get("host") ||
    request.nextUrl.hostname ||
    ""
  )
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function shortLinkHostResponse(request: NextRequest) {
  const configuredHost = String(process.env.SHORT_LINK_HOST || "").trim().toLowerCase();
  if (!configuredHost || normalizedHostname(request) !== configuredHost) return null;

  const pathname = request.nextUrl.pathname;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");

  // Universal/app-link association files must be served directly by this runtime.
  if (pathname.startsWith("/.well-known/")) return null;

  if (pathname === "/") return NextResponse.redirect(siteUrl, 302);

  const code = pathname.replace(/^\/+|\/+$/g, "");
  if (SHORT_CODE_PATTERN.test(code) && !code.includes("/")) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/p/${code}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  // Keep application/admin/API routes off the branded short-link host.
  return NextResponse.redirect(siteUrl, 302);
}

function reserveHandoff(pathname: string) {
  return (
    pathname === "/reservations" ||
    pathname.startsWith("/reservations/") ||
    pathname.startsWith("/embed/reservations/") ||
    /^\/locations\/[^/]+\/[^/]+\/reserve(?:\/|$)/.test(pathname) ||
    pathname.startsWith("/api/reservations/") ||
    pathname.startsWith("/api/internal/reserve/") ||
    pathname === "/api/widgets/reservations" ||
    pathname === "/api/public/large-group-availability" ||
    pathname === "/api/public/large-group-bookings"
  );
}

export function proxy(request: NextRequest) {
  const shortHostResponse = shortLinkHostResponse(request);
  if (shortHostResponse) return shortHostResponse;

  const { pathname, search } = request.nextUrl;
  if (reserveHandoff(pathname)) {
    return NextResponse.redirect(`https://reserve.theouthaven.com${pathname}${search}`, 308);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api/health/platform-dr$).*)"] };
