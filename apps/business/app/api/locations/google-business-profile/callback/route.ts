import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { resolveWebSurfaceAuthOrigin } from "@/lib/web-surface-auth-origin";
import {
  exchangeGoogleBusinessCode,
  listGoogleBusinessCandidates,
  storeGoogleBusinessSecrets,
  verifyGoogleBusinessState,
} from "@/lib/google/google-business-profile";

export const dynamic = "force-dynamic";

function withParam(path: string, key: string, value: string) {
  const url = new URL(path, "https://business.theouthaven.com");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = resolveWebSurfaceAuthOrigin(request, requestUrl);
  const code = String(requestUrl.searchParams.get("code") || "");
  const stateValue = String(requestUrl.searchParams.get("state") || "");
  const oauthError = String(requestUrl.searchParams.get("error") || "");

  let state: ReturnType<typeof verifyGoogleBusinessState> | null = null;
  try {
    state = verifyGoogleBusinessState(stateValue);
  } catch (error) {
    return NextResponse.redirect(new URL(
      `/locations/dashboard/social-accounts?error=${encodeURIComponent(error instanceof Error ? error.message : "Invalid Google authorization state.")}`,
      origin,
    ));
  }

  if (oauthError || !code) {
    return NextResponse.redirect(new URL(withParam(state.returnTo, "error", oauthError || "Google authorization was not completed."), origin));
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== state.userId) throw new Error("Your business session changed during Google authorization. Please try again.");

    const access = await requireOwnerOrAdminAccessToLocation(user.id, state.locationId);
    if (!access) throw new Error("You no longer have permission to connect Google Business Profile for this location.");

    const redirectUri = new URL("/api/locations/google-business-profile/callback", origin).toString();
    const token = await exchangeGoogleBusinessCode(code, redirectUri);
    const candidates = await listGoogleBusinessCandidates(token.access_token);
    const canonicalLocationId = String(access.location.id);
    const localPlaceId = String(access.location.google_place_id || "").trim();

    const exactMatches = localPlaceId
      ? candidates.filter((candidate) => candidate.placeId && candidate.placeId === localPlaceId)
      : [];
    const selected = exactMatches.length === 1
      ? exactMatches[0]
      : candidates.length === 1
        ? candidates[0]
        : null;
    const now = new Date().toISOString();
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    const grantedScopes = token.scope ? token.scope.split(" ").filter(Boolean) : [];

    const row = {
      location_id: canonicalLocationId,
      google_account_name: selected?.accountName || null,
      google_account_display_name: selected?.accountDisplayName || null,
      google_location_name: selected?.locationName || null,
      google_location_title: selected?.title || null,
      google_place_id: selected?.placeId || localPlaceId || null,
      status: selected ? "connected" : "mapping_required",
      granted_scopes: grantedScopes,
      token_expires_at: expiresAt,
      connected_by: user.id,
      last_refreshed_at: now,
      last_error: null,
      candidate_locations: candidates,
      metadata: {
        candidate_count: candidates.length,
        auto_mapped_by_place_id: exactMatches.length === 1,
      },
      updated_at: now,
    };

    const { data: existing } = await supabaseAdmin
      .from("google_business_profile_connections")
      .select("id,connected_at")
      .eq("location_id", canonicalLocationId)
      .maybeSingle();

    let connectionId = String(existing?.id || "");
    if (connectionId) {
      const { error } = await supabaseAdmin
        .from("google_business_profile_connections")
        .update(row)
        .eq("id", connectionId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseAdmin
        .from("google_business_profile_connections")
        .insert({ ...row, connected_at: now })
        .select("id")
        .single();
      if (error || !data?.id) throw error || new Error("Could not save Google Business Profile connection.");
      connectionId = String(data.id);
    }

    await storeGoogleBusinessSecrets({
      connectionId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      tokenType: token.token_type || "Bearer",
      expiresAt,
    });

    const result = selected ? "connected" : "mapping_required";
    return NextResponse.redirect(new URL(withParam(state.returnTo, "googleBusiness", result), origin));
  } catch (error) {
    return NextResponse.redirect(new URL(
      withParam(state.returnTo, "error", error instanceof Error ? error.message : "Google Business Profile connection failed."),
      origin,
    ));
  }
}
