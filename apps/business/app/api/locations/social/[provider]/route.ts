import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { supabaseAdmin } from "@/lib/supabase-admin";
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


export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await params;
  if (!isLocationSocialProvider(rawProvider)) {
    return NextResponse.json({ error: "Unsupported social provider." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const locationId = String(body.locationId || body.location_id || "").trim();
  if (!locationId) return NextResponse.json({ error: "locationId is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId,
    permission: "marketing.edit",
  });
  if (guard.error || !guard.access?.canonicalLocationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canonicalLocationId = String(guard.access.canonicalLocationId);
  const { data: connections, error: loadError } = await supabaseAdmin
    .from("marketing_social_connections")
    .select("id")
    .eq("scope", "location")
    .eq("location_id", canonicalLocationId)
    .eq("provider", rawProvider)
    .neq("status", "disconnected");
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

  const ids = (connections || []).map((row) => String(row.id));
  if (ids.length) {
    const { error: secretError } = await supabaseAdmin
      .from("marketing_social_connection_secrets")
      .delete()
      .in("connection_id", ids);
    if (secretError) return NextResponse.json({ error: secretError.message }, { status: 500 });

    const { error: disconnectError } = await supabaseAdmin
      .from("marketing_social_connections")
      .update({
        status: "disconnected",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (disconnectError) return NextResponse.json({ error: disconnectError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, provider: rawProvider, disconnected: ids.length });
}
