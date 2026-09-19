import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkReservationAvailability, clearExpiredSlotLocks } from "@/lib/reservations/availability";
import { logEvent } from "@/lib/monitoring";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const locationId = cleanString(body.location_id);
    const reservationDate = cleanString(body.reservation_date);
    const reservationTime = cleanString(body.reservation_time).slice(0, 5);
    const partySize = Math.max(Number(body.party_size || 2), 1);

    if (!locationId || !reservationDate || !reservationTime) {
      return NextResponse.json({ success: false, reason: "Missing reservation slot." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await clearExpiredSlotLocks();

    const availability = await checkReservationAvailability({
      location_id: locationId,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      party_size: partySize,
      user_id: user?.id || null,
    });

    if (!availability.available) {
      return NextResponse.json({ success: false, reason: availability.reason || "Slot no longer available" }, { status: 409 });
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { data: lock, error } = await supabaseAdmin.from("reservation_slot_locks").insert({
      location_id: locationId,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      party_size: partySize,
      locked_by: user?.id || null,
      expires_at: expiresAt,
    }).select("id, expires_at").single();

    if (error) {
      await logEvent("failed_api", { route: "reservations_lock_slot", error: error.message });
      return NextResponse.json({ success: false, reason: error.message }, { status: 500 });
    }

    await logEvent("reservation_audit", { action: "slot_locked", lockId: lock?.id || null, locationId, reservationDate, reservationTime, partySize });
    return NextResponse.json({ success: true, lock_id: lock?.id, expires_at: expiresAt });
  } catch (error) {
    await logEvent("failed_api", { route: "reservations_lock_slot", error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ success: false, reason: error instanceof Error ? error.message : "Something went wrong." }, { status: 500 });
  }
}
