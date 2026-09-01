import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import {
  completeLocationInstagramOauth,
  verifyLocationInstagramOauthState,
} from "@/lib/marketing/location-instagram-oauth";

export const dynamic = "force-dynamic";

function baseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.theouthaven.com";
}

function fallbackRedirect(message: string) {
  const url = new URL("/locations/dashboard/social-accounts", baseUrl());
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

function stateRedirect(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, baseUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const stateValue = requestUrl.searchParams.get("state") || "";
  if (!stateValue) return fallbackRedirect("Instagram callback was missing the OAuth state.");

  let state;
  try {
    state = verifyLocationInstagramOauthState(stateValue);
  } catch (error) {
    return fallbackRedirect(error instanceof Error ? error.message : "Instagram OAuth state was invalid.");
  }

  const providerError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");
  if (providerError) return stateRedirect(state.returnTo, { error: providerError });

  const code = requestUrl.searchParams.get("code") || "";
  if (!code) return stateRedirect(state.returnTo, { error: "Instagram did not return an authorization code." });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", baseUrl()));
  if (user.id !== state.userId) return stateRedirect(state.returnTo, { error: "Instagram connection session does not match the signed-in user." });

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId: state.locationId,
    permission: "marketing.edit",
  });
  if (guard.error || guard.access?.canonicalLocationId !== state.locationId) {
    return stateRedirect(state.returnTo, { error: "You no longer have permission to connect Instagram for this location." });
  }

  try {
    const connection = await completeLocationInstagramOauth({
      code,
      userId: user.id,
      locationId: state.locationId,
    });
    return stateRedirect(state.returnTo, {
      connected: "instagram",
      account: connection.username || "Instagram",
    });
  } catch (error) {
    console.error("LOCATION_INSTAGRAM_OAUTH_CALLBACK_FAILED", {
      locationId: state.locationId,
      error,
    });
    return stateRedirect(state.returnTo, {
      error: error instanceof Error ? error.message : "Instagram connection failed.",
    });
  }
}
