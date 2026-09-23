import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { resolveWebSurfaceAuthOrigin } from "@/lib/web-surface-auth-origin";
import {
  completeLocationSocialOauth,
  isLocationSocialProvider,
  verifyLocationSocialOauthState,
} from "@/lib/marketing/location-social-oauth";

export const dynamic = "force-dynamic";

function redirectWith(origin: string, returnTo: string, values: Record<string, string>) {
  const url = new URL(returnTo, origin);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

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
  const stateValue = requestUrl.searchParams.get("state") || "";
  if (!stateValue) {
    return NextResponse.redirect(new URL("/locations/dashboard/social-accounts?error=Social%20callback%20was%20missing%20OAuth%20state.", origin));
  }

  let state;
  try {
    state = verifyLocationSocialOauthState(stateValue, rawProvider);
  } catch (error) {
    return NextResponse.redirect(new URL(
      `/locations/dashboard/social-accounts?error=${encodeURIComponent(error instanceof Error ? error.message : "Social OAuth state was invalid.")}`,
      origin,
    ));
  }

  const providerError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");
  if (providerError) return redirectWith(origin, state.returnTo, { error: providerError });

  const code = requestUrl.searchParams.get("code") || "";
  if (!code) return redirectWith(origin, state.returnTo, { error: "Social provider did not return an authorization code." });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = encodeURIComponent(state.returnTo);
    return NextResponse.redirect(new URL(`/business/login?next=${next}`, origin));
  }
  if (user.id !== state.userId) {
    return redirectWith(origin, state.returnTo, { error: "Social connection session does not match the signed-in user." });
  }

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId: state.locationId,
    permission: "marketing.edit",
  });
  if (guard.error || String(guard.access?.canonicalLocationId || "") !== state.locationId) {
    return redirectWith(origin, state.returnTo, { error: "You no longer have permission to connect this social account." });
  }

  try {
    const redirectUri = new URL(`/api/locations/social/${rawProvider}/callback`, origin).toString();
    await completeLocationSocialOauth({
      provider: rawProvider,
      code,
      userId: user.id,
      locationId: state.locationId,
      redirectUri,
    });
    return redirectWith(origin, state.returnTo, { connected: rawProvider });
  } catch (error) {
    return redirectWith(origin, state.returnTo, {
      error: error instanceof Error ? error.message : "Social account connection failed.",
    });
  }
}
