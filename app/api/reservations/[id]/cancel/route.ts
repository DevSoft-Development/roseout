import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canCancelReservation } from "@/lib/reservations/status";
import { sendReservationCancelledEmail, sendWaitlistAvailableEmail } from "@/lib/email/reservation-emails";
import { sendReservationCancelledSMS, sendWaitlistSMS } from "@/lib/sms/reservation-sms";
import { getLocationName } from "@/lib/locationName";
import { trackLocationAnalyticsEvent } from "@/lib/analytics/business-analytics";
import { logEvent } from "@/lib/monitoring";

type ReservationForWaitlist = {
  location_id: string;
  reservation_date: string;
  reservation_time: string;
};

async function notifyFirstWaitlistMatch(reservation: ReservationForWaitlist, locationName: string) {
  const { data: waitlist } = await supabaseAdmin
    .from("reservation_waitlist")
    .select("*")
    .eq("location_id", reservation.location_id)
    .eq("reservation_date", reservation.reservation_date)
    .eq("reservation_time", String(reservation.reservation_time).slice(0, 5))
    .eq("status", "waiting")
    .gte("party_size", 1)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!waitlist) return null;

  await supabaseAdmin
    .from("reservation_waitlist")
    .update({ status: "notified", notified_at: new Date().toISOString() })
    .eq("id", waitlist.id);

  await Promise.allSettled([
    sendWaitlistAvailableEmail({
      to: waitlist.contact_email,
      locationName,
      reservationDate: reservation.reservation_date,
      reservationTime: reservation.reservation_time,
      partySize: waitlist.party_size,
    }),
    sendWaitlistSMS({
      to: waitlist.contact_phone || waitlist.customer_phone,
      locationName,
      reservationDate: reservation.reservation_date,
      reservationTime: reservation.reservation_time,
    }),
  ]);

  return waitlist;
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
      return NextResponse.json({ error: "You cannot cancel this reservation." }, { status: 403 });
    }

    if (!canCancelReservation(existing.status)) {
      return NextResponse.json({ error: "This reservation can no longer be cancelled." }, { status: 400 });
    }

    const { data: location } = await supabaseAdmin
      .from("locations")
      .select("id, name, restaurant_name, activity_name, business_name")
      .eq("id", existing.location_id)
      .maybeSingle();

    const locationName = getLocationName(location || {}, "TheOutHaven location");
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("location_reservations")
      .update({ status: "cancelled", cancelled_at: now, customer_cancelled_at: now, updated_at: now })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabaseAdmin
      .from("reservation_slot_locks")
      .delete()
      .eq("location_id", existing.location_id)
      .eq("reservation_date", existing.reservation_date)
      .eq("reservation_time", String(existing.reservation_time).slice(0, 5));

    await trackLocationAnalyticsEvent({
      locationId: existing.location_id,
      userId: user?.id || existing.user_id || null,
      eventType: "reservation_cancelled",
      eventSource: "reservation",
      metadata: {
        party_size: existing.party_size,
        reservation_date: existing.reservation_date,
        reservation_time: existing.reservation_time,
        reservation_id: existing.id,
      },
    });

    const notifiedWaitlist = await notifyFirstWaitlistMatch(existing, locationName);

    await Promise.allSettled([
      sendReservationCancelledEmail({
        to: existing.customer_email,
        locationName,
        reservationDate: existing.reservation_date,
        reservationTime: existing.reservation_time,
        partySize: existing.party_size,
        confirmationCode: existing.confirmation_code || existing.customer_token,
      }),
      sendReservationCancelledSMS({
        to: existing.customer_phone,
        locationName,
        reservationDate: existing.reservation_date,
        reservationTime: existing.reservation_time,
      }),
    ]);

    await logEvent("reservation_audit", { action: "customer_cancelled", reservationId: id, userId: user?.id || null, locationId: existing.location_id });
    return NextResponse.json({ success: true, reservation: data, notified_waitlist: notifiedWaitlist });
  } catch (error) {
    await logEvent("failed_api", { route: "reservations_cancel", error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong." }, { status: 500 });
  }
}
