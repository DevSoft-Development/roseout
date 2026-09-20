import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_DEMO_HANDOFF_COOKIE,
  verifyAdminDemoHandoff,
} from "@theouthaven/auth/admin-demo-handoff";

export const dynamic = "force-dynamic";

function safeNext(value: string | null) {
  const raw = String(value || "").trim();
  if (
    raw === "/reserve/dashboard" ||
    raw.startsWith("/reserve/dashboard?") ||
    raw.startsWith("/reserve/dashboard/") ||
    raw === "/reserve/portal" ||
    raw.startsWith("/reserve/portal?") ||
    raw.startsWith("/reserve/portal/")
  ) {
    return raw;
  }
  return "/reserve/dashboard";
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const payload = verifyAdminDemoHandoff(token);
  if (!payload) {
    return NextResponse.redirect(new URL("/reserve", request.url), 302);
  }

  const destination = safeNext(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(destination, request.url), 302);
  response.cookies.set(ADMIN_DEMO_HANDOFF_COOKIE, token!, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, payload.exp - Math.floor(Date.now() / 1000)),
  });
  return response;
}
