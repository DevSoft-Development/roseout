import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_DEMO_HANDOFF_COOKIE,
  verifyAdminDemoHandoff,
} from "@theouthaven/auth/admin-demo-handoff";

export const dynamic = "force-dynamic";

function safeNext(value: string | null) {
  const raw = String(value || "").trim();
  if (
    raw === "/locations/dashboard" ||
    raw.startsWith("/locations/dashboard?") ||
    raw.startsWith("/locations/dashboard/") ||
    raw === "/business/dashboard" ||
    raw.startsWith("/business/dashboard?") ||
    raw.startsWith("/business/dashboard/")
  ) {
    return raw;
  }
  return "/locations/dashboard";
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const payload = verifyAdminDemoHandoff(token);
  if (!payload) {
    return NextResponse.redirect(new URL("/business/login", request.url), 302);
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
