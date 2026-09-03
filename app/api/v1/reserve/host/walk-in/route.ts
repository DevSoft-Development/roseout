import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getReserveCanonicalLocationId, requireReservePermission } from "@/lib/reserve/locationPermissions";
import { getReserveStaffSession } from "@/lib/reserve/staffSession";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export async function POST(request: NextRequest) {
  const body = await request.json();
  const locationId = clean(body.locationId || body.location_id);
  const name = clean(body.name || body.customer_name) || "Walk-in guest";
  const partySize = Math.max(1, Math.min(Number(body.partySize || body.party_size || 1) || 1, 100));
  const date = clean(body.date || body.reservation_date);
  const time = clean(body.time || body.reservation_time).slice(0, 5);
  if (!locationId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ success: false, error: "Choose the service date and time." }, { status: 400 });
  }
  const auth = await requireReservePermission(locationId, "manageReservations");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const staffSession = await getReserveStaffSession(canonicalLocationId);
  const location = await supabaseAdmin.from("locations").select("location_type").eq("id", canonicalLocationId).maybeSingle();
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("location_reservations").insert({
    location_id: canonicalLocationId,
    location_type: location.data?.location_type || "restaurant",
    customer_name: name,
    customer_phone: clean(body.phone || body.customer_phone) || null,
    customer_email: clean(body.email || body.customer_email) || null,
    party_size: partySize,
    reservation_date: date,
    reservation_time: time,
    status: "checked_in",
    source: "walk_in",
    checked_in_at: now,
    arrived_at: now,
    duration_minutes: Math.max(15, Number(body.durationMinutes || 90) || 90),
    updated_at: now,
  }).select("*").single();
  if (result.error) return NextResponse.json({ success: false, error: result.error.message }, { status: 500 });
  await supabaseAdmin.from("reserve_service_events").insert({
    location_id: canonicalLocationId,
    reservation_id: result.data.id,
    staff_profile_id: staffSession?.staff_profile_id || null,
    event_type: "walkin.created",
    metadata: { party_size: partySize },
  });
  return NextResponse.json({ success: true, reservation: result.data }, { status: 201, headers: { "Cache-Control": "no-store", "X-TheOutHaven-API-Lane": "reserve-v1" } });
}