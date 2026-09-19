import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import {
  createLocationInstagramOauthState,
  locationInstagramAuthorizeUrl,
} from "@/lib/marketing/location-instagram-oauth";

export const dynamic = "force-dynamic";

function baseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.theouthaven.com";
}

function dashboardRedirect(message: string, locationId?: string | null) {
  const url = new URL("/locations/dashboard/social-accounts", baseUrl());
  if (locationId) url.searchParams.set("locationId", locationId);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", baseUrl()));

  const requestedLocationId = requestUrl.searchParams.get("locationId");
  const fallbackLocation = requestedLocationId ? null : await getCurrentBusinessLocation();
  const locationId = requestedLocationId || (fallbackLocation?.id ? String(fallbackLocation.id) : "");
  if (!locationId) return dashboardRedirect("No location is selected.");

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId,
    permission: "marketing.edit",
  });
  if (guard.error || !guard.access?.canonicalLocationId) {
    return dashboardRedirect("You do not have permission to connect Instagram for this location.", locationId);
  }

  try {
    const returnTo = requestUrl.searchParams.get("returnTo") || `/locations/dashboard/social-accounts?locationId=${encodeURIComponent(guard.access.canonicalLocationId)}`;
    const state = createLocationInstagramOauthState({
      userId: user.id,
      locationId: guard.access.canonicalLocationId,
      returnTo,
    });
    return NextResponse.redirect(await locationInstagramAuthorizeUrl(state));
  } catch (error) {
    console.error("LOCATION_INSTAGRAM_OAUTH_START_FAILED", {
      locationId: guard.access.canonicalLocationId,
      error,
    });
    return dashboardRedirect(
      error instanceof Error ? error.message : "Instagram connection could not be started.",
      guard.access.canonicalLocationId,
    );
  }
}
