import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { resolveWebSurfaceAuthOrigin } from "@/lib/web-surface-auth-origin";
import {
  createLocationSocialOauthState,
  isLocationSocialProvider,
  locationSocialAuthorizeUrl,
} from "@/lib/marketing/location-social-oauth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await params;
  if (!isLocationSocialProvider(rawProvider)) {
    return NextResponse.json({ error: "Unsupported social provider." }, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const origin = resolveWebSurfaceAuthOrigin(request, requestUrl);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = encodeURIComponent("/locations/dashboard/social-accounts");
    return NextResponse.redirect(new URL(`/business/login?next=${next}`, origin));
  }

  const requestedLocationId = requestUrl.searchParams.get("locationId");
  const fallbackLocation = requestedLocationId ? null : await getCurrentBusinessLocation();
  const locationId = requestedLocationId || (fallbackLocation?.id ? String(fallbackLocation.id) : "");
  if (!locationId) {
    return NextResponse.redirect(new URL("/locations/dashboard/social-accounts?error=No%20location%20is%20selected.", origin));
  }

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId,
    permission: "marketing.edit",
  });
  if (guard.error || !guard.access?.canonicalLocationId) {
    return NextResponse.redirect(new URL(
      `/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}&error=${encodeURIComponent(`You do not have permission to connect ${rawProvider} for this location.`)}`,
      origin,
    ));
  }

  try {
    const canonicalLocationId = String(guard.access.canonicalLocationId);
    const returnTo = requestUrl.searchParams.get("returnTo")
      || `/locations/dashboard/social-accounts?locationId=${encodeURIComponent(canonicalLocationId)}`;
    const redirectUri = new URL(`/api/locations/social/${rawProvider}/callback`, origin).toString();
    const state = createLocationSocialOauthState({
      provider: rawProvider,
      userId: user.id,
      locationId: canonicalLocationId,
      returnTo,
    });
    return NextResponse.redirect(locationSocialAuthorizeUrl({
      provider: rawProvider,
      state,
      redirectUri,
    }));
  } catch (error) {
    return NextResponse.redirect(new URL(
      `/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}&error=${encodeURIComponent(error instanceof Error ? error.message : "Social connection could not be started.")}`,
      origin,
    ));
  }
}
