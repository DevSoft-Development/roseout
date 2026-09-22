import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { resolveWebSurfaceAuthOrigin } from "@/lib/web-surface-auth-origin";
import {
  createGoogleBusinessState,
  googleBusinessAuthorizeUrl,
  googleBusinessConfigured,
} from "@/lib/google/google-business-profile";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const locationId = String(requestUrl.searchParams.get("locationId") || "").trim();
  const returnTo = requestUrl.searchParams.get("returnTo");
  if (!locationId) return NextResponse.json({ error: "locationId is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = encodeURIComponent(`/locations/dashboard/social-accounts?locationId=${locationId}`);
    return NextResponse.redirect(new URL(`/business/login?next=${next}`, resolveWebSurfaceAuthOrigin(request, requestUrl)));
  }

  const access = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!googleBusinessConfigured()) {
    return NextResponse.redirect(new URL(
      `/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}&error=${encodeURIComponent("Google Business Profile is not configured by TheOutHaven yet.")}`,
      resolveWebSurfaceAuthOrigin(request, requestUrl),
    ));
  }

  const origin = resolveWebSurfaceAuthOrigin(request, requestUrl);
  const redirectUri = new URL("/api/locations/google-business-profile/callback", origin).toString();
  const state = createGoogleBusinessState({
    userId: user.id,
    locationId: String(access.location.id),
    returnTo,
  });
  return NextResponse.redirect(googleBusinessAuthorizeUrl(state, redirectUri));
}
