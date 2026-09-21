import { NextRequest, NextResponse } from "next/server";
import { resolveReserveBusinessDashboardReturn } from "@/lib/reserve/businessDashboardReturn";
import { signBusinessReserveHandoff } from "@theouthaven/auth/business-reserve-handoff";

function businessOrigin() {
  return String(
    process.env.NEXT_PUBLIC_BUSINESS_SITE_URL ||
      process.env.BUSINESS_SITE_URL ||
      "https://business.theouthaven.com",
  ).replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  const locationId = String(request.nextUrl.searchParams.get("locationId") || "").trim();
  if (!locationId) {
    return NextResponse.redirect(new URL("/staff", request.nextUrl.origin), 302);
  }

  const context = await resolveReserveBusinessDashboardReturn(locationId);
  if (!context.allowed) {
    return NextResponse.redirect(
      new URL(`/staff?locationId=${encodeURIComponent(locationId)}`, request.nextUrl.origin),
      302,
    );
  }

  if (context.demoToken) {
    const next = new URLSearchParams({
      adminLocationId: locationId,
      locationId,
      type: context.demoType || "restaurant",
      demo: "1",
      fromDemoCenter: "1",
    });
    const target = new URL("/api/internal/admin-demo-handoff", businessOrigin());
    target.searchParams.set("token", context.demoToken);
    target.searchParams.set("next", `/locations/dashboard?${next.toString()}`);
    return NextResponse.redirect(target, 302);
  }

  const token = signBusinessReserveHandoff({
    userId: context.userId!,
    email: context.email ?? null,
    locationId,
  });
  const target = new URL("/api/internal/reserve-business-handoff", businessOrigin());
  target.searchParams.set("token", token);
  target.searchParams.set("next", "/locations/dashboard");
  return NextResponse.redirect(target, 302);
}
