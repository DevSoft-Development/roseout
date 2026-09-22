import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import {
  accessTokenForConnection,
  computeGoogleBusinessMismatches,
  getGoogleBusinessLocation,
  googleBusinessHealth,
  googlePayloadForField,
  localUpdatesForGoogleField,
  patchGoogleBusinessLocation,
  type GoogleBusinessMismatch,
} from "@/lib/google/google-business-profile";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = new Set<GoogleBusinessMismatch["field"]>(["title", "phone", "website", "address", "hours"]);

async function refreshState(connection: any, location: any) {
  if (!connection.google_location_name) throw new Error("Map a Google Business Profile location first.");
  const accessToken = await accessTokenForConnection(String(connection.id));
  const google = await getGoogleBusinessLocation(accessToken, String(connection.google_location_name));
  const mismatches = computeGoogleBusinessMismatches(location, google);
  const now = new Date().toISOString();
  const healthScore = googleBusinessHealth({
    mapped: true,
    status: "connected",
    mismatchCount: mismatches.length,
    lastSyncAt: now,
    tokenExpiresAt: connection.token_expires_at,
  });
  const { error } = await supabaseAdmin
    .from("google_business_profile_connections")
    .update({
      google_location_title: google.title || connection.google_location_title || null,
      google_place_id: google.metadata?.placeId || connection.google_place_id || null,
      status: "connected",
      last_sync_at: now,
      last_refreshed_at: now,
      last_error: null,
      mismatch_count: mismatches.length,
      mismatches,
      health_score: healthScore,
      metadata: {
        ...(connection.metadata || {}),
        google_metadata: google.metadata || {},
        last_read_mask: "name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,metadata",
      },
      updated_at: now,
    })
    .eq("id", connection.id);
  if (error) throw error;
  return { google, mismatches, healthScore, lastSyncAt: now };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const locationId = String(body.location_id || body.locationId || "").trim();
  const action = String(body.action || "refresh").trim();
  const field = String(body.field || "").trim() as GoogleBusinessMismatch["field"];
  if (!locationId) return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  if (!["refresh", "use_google", "use_theouthaven", "disconnect"].includes(action)) {
    return NextResponse.json({ error: "Unsupported sync action." }, { status: 400 });
  }
  if ((action === "use_google" || action === "use_theouthaven") && !ALLOWED_FIELDS.has(field)) {
    return NextResponse.json({ error: "A supported field is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const canonicalId = String(access.location.id);

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("google_business_profile_connections")
    .select("*")
    .eq("location_id", canonicalId)
    .maybeSingle();
  if (connectionError) return NextResponse.json({ error: connectionError.message }, { status: 500 });
  if (!connection) return NextResponse.json({ error: "Google Business Profile is not connected." }, { status: 404 });

  if (action === "disconnect") {
    await supabaseAdmin.from("google_business_profile_connection_secrets").delete().eq("connection_id", connection.id);
    await supabaseAdmin.from("google_business_profile_connections").update({
      status: "disconnected",
      last_error: null,
      health_score: 0,
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
    return NextResponse.json({ ok: true, status: "disconnected" });
  }

  try {
    const { data: freshLocation, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("*")
      .eq("id", canonicalId)
      .single();
    if (locationError || !freshLocation) throw locationError || new Error("Location could not be loaded.");

    if (action === "use_google") {
      if (!connection.google_location_name) throw new Error("Map a Google Business Profile location first.");
      const token = await accessTokenForConnection(String(connection.id));
      const google = await getGoogleBusinessLocation(token, String(connection.google_location_name));
      const updates = localUpdatesForGoogleField(field, google);
      const { error } = await supabaseAdmin.from("locations").update(updates).eq("id", canonicalId);
      if (error) throw error;
    }

    if (action === "use_theouthaven") {
      if (!connection.google_location_name) throw new Error("Map a Google Business Profile location first.");
      const token = await accessTokenForConnection(String(connection.id));
      const patch = googlePayloadForField(field, freshLocation);
      await patchGoogleBusinessLocation(token, String(connection.google_location_name), patch.updateMask, patch.payload);
    }

    const { data: latestLocation, error: latestError } = await supabaseAdmin
      .from("locations")
      .select("*")
      .eq("id", canonicalId)
      .single();
    if (latestError || !latestLocation) throw latestError || new Error("Location could not be refreshed.");

    const result = await refreshState(connection, latestLocation);
    return NextResponse.json({
      ok: true,
      status: "connected",
      mismatches: result.mismatches,
      mismatch_count: result.mismatches.length,
      health_score: result.healthScore,
      last_sync_at: result.lastSyncAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Business Profile sync failed.";
    const authFailure = /\(40[13]\)|authorization|token|unauthorized|forbidden/i.test(message);
    await supabaseAdmin.from("google_business_profile_connections").update({
      status: authFailure ? "reauthorization_required" : "degraded",
      last_error: message.slice(0, 1000),
      health_score: authFailure ? 20 : Math.max(10, Number(connection.health_score || 50) - 20),
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
    return NextResponse.json({ error: message, reauthorization_required: authFailure }, { status: authFailure ? 401 : 502 });
  }
}
