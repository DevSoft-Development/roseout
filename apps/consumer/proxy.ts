import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
  const { pathname, search } = request.nextUrl;
  if (reserveHandoff(pathname)) {
    return NextResponse.redirect(`https://reserve.theouthaven.com${pathname}${search}`, 308);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/:path*"] };
