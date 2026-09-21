import { NextRequest, NextResponse } from "next/server";
import {
  BUSINESS_RESERVE_HANDOFF_COOKIE,
  verifyBusinessReserveHandoff,
} from "@theouthaven/auth/business-reserve-handoff";

export const dynamic = "force-dynamic";

function safeNext(value: string | null) {
  const raw = String(value || "").trim();
  if (
    raw === "/locations/dashboard" ||
    raw.startsWith("/locations/dashboard?") ||
    raw.startsWith("/locations/dashboard/")
  ) {
    return raw;
  }
  return "/locations/dashboard";
}

export async function GET(request: NextRequest) {
  const publicOrigin = String(
    process.env.NEXT_PUBLIC_BUSINESS_SITE_URL ||
      process.env.BUSINESS_SITE_URL ||
      "https://business.theouthaven.com",
  ).replace(/\/$/, "");
  const token = request.nextUrl.searchParams.get("token");
  const payload = verifyBusinessReserveHandoff(token);

  if (!payload) {
    return NextResponse.redirect(new URL("/business/login?next=/locations/dashboard", publicOrigin), 302);
  }

  const destination = safeNext(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(destination, publicOrigin), 302);
  response.cookies.set(BUSINESS_RESERVE_HANDOFF_COOKIE, token!, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, payload.exp - Math.floor(Date.now() / 1000)),
  });
  return response;
}
