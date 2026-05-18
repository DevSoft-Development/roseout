import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkReservationAvailability } from "@/lib/reservations/availability";
import { canModifyReservation } from "@/lib/reservations/status";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("location_reservations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const ownsReservation = user?.id && existing.user_id === user.id;
    const emailMatches = user?.email && existing.customer_email === user.email;
    if (!ownsReservation && !emailMatches) {
      return NextResponse.json({ error: "You cannot modify this reservation." }, { status: 403 });
    }

    if (!canModifyReservation(existing.status)) {
      return NextResponse.json({ error: "This reservation can no longer be modified." }, { status: 400 });
    }

    const reservationDate = cleanString(body.reservation_date) || existing.reservation_date;
    const reservationTime = (cleanString(body.reservation_time) || String(existing.reservation_time)).slice(0, 5);
    const partySize = Math.max(Number(body.party_size || existing.party_size || 2), 1);

    const availability = await checkReservationAvailability({
      location_id: existing.location_id,
      location_type: existing.location_type,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      party_size: partySize,
      exclude_reservation_id: id,
      user_id: user?.id || existing.user_id || null,
      customer_email: existing.customer_email || user?.email || null,
    });

    if (!availability.available) {
      return NextResponse.json({ error: availability.reason || "Slot no longer available", availability }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("location_reservations")
      .update({
        reservation_date: reservationDate,
        reservation_time: reservationTime,
        party_size: partySize,
        special_request: cleanString(body.special_request) || existing.special_request || null,
        special_requests: cleanString(body.special_requests) || cleanString(body.special_request) || existing.special_requests || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, reservation: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong." }, { status: 500 });
  }
}
