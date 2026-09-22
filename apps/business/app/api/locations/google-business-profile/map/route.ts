import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import type { GoogleBusinessCandidate } from "@/lib/google/google-business-profile";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const locationId = String(body.location_id || body.locationId || "").trim();
  const googleLocationName = String(body.google_location_name || body.googleLocationName || "").trim();
  if (!locationId || !googleLocationName) {
    return NextResponse.json({ error: "locationId and googleLocationName are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const canonicalId = String(access.location.id);
  const { data: connection, error } = await supabaseAdmin
    .from("google_business_profile_connections")
    .select("id,candidate_locations")
    .eq("location_id", canonicalId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!connection) return NextResponse.json({ error: "Connect Google Business Profile first." }, { status: 404 });

  const candidates = Array.isArray(connection.candidate_locations)
    ? connection.candidate_locations as GoogleBusinessCandidate[]
    : [];
  const selected = candidates.find((candidate) => candidate.locationName === googleLocationName);
  if (!selected) return NextResponse.json({ error: "That Google location is not part of the authorized account." }, { status: 400 });

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("google_business_profile_connections")
    .update({
      google_account_name: selected.accountName,
      google_account_display_name: selected.accountDisplayName,
      google_location_name: selected.locationName,
      google_location_title: selected.title,
      google_place_id: selected.placeId || access.location.google_place_id || null,
      status: "connected",
      last_error: null,
      updated_at: now,
    })
    .eq("id", connection.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: "connected", location: selected });
}
