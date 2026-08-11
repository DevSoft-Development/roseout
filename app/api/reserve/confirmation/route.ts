import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canCancelReservation } from "@/lib/reservations/status";
import {
  sendReservationCancelledEmail,
  sendWaitlistAvailableEmail,
} from "@/lib/email/reservation-emails";
import {
  sendReservationCancelledSMS,
  sendWaitlistSMS,
} from "@/lib/sms/reservation-sms";
import { getLocationName } from "@/lib/locationName";
import { trackLocationAnalyticsEvent } from "@/lib/analytics/business-analytics";
import { logEvent } from "@/lib/monitoring";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

type ReservationForWaitlist = {
  location_id: string;
  reservation_date: string;
  reservation_time: string;
};

async function notifyFirstWaitlistMatch(
  reservation: ReservationForWaitlist,
  locationName: string,
) {
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = cleanString(searchParams.get("token"));

    if (!token) {
      return NextResponse.json({ error: "Missing token." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("location_reservations")
      .select("*")
      .eq("customer_token", token)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Reservation not found." },
        { status: 404 },
      );
    }

    if (isExpired(data.customer_token_expires_at)) {
      return NextResponse.json(
        { error: "This reservation link has expired." },
        { status: 410 },
      );
    }

    return NextResponse.json({ reservation: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Something went wrong." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const token = cleanString(body.token);
    const action = cleanString(body.action);

    if (!token) {
      return NextResponse.json({ error: "Missing token." }, { status: 400 });
    }

    if (!["confirm", "cancel"].includes(action)) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("location_reservations")
      .select("*")
      .eq("customer_token", token)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Reservation not found." },
        { status: 404 },
      );
    }

    if (isExpired(existing.customer_token_expires_at)) {
      return NextResponse.json(
        { error: "This reservation link has expired." },
        { status: 410 },
      );
    }

    if (existing.status === "cancelled") {
      return NextResponse.json(
        { error: "This reservation is already cancelled." },
        { status: 400 },
      );
    }

    if (action === "confirm") {
      const { data, error } = await supabaseAdmin
        .from("location_reservations")
        .update({
          customer_confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("customer_token", token)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, reservation: data });
    }

    if (!canCancelReservation(existing.status)) {
      return NextResponse.json(
        { error: "This reservation can no longer be cancelled." },
        { status: 400 },
      );
    }

    const { data: location } = await supabaseAdmin
      .from("locations")
      .select("id, name, restaurant_name, activity_name, business_name")
      .eq("id", existing.location_id)
      .maybeSingle();

    const locationName = getLocationName(
      location || {},
      "TheOutHaven location",
    );
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("location_reservations")
      .update({
        status: "cancelled",
        cancelled_at: now,
        customer_cancelled_at: now,
        updated_at: now,
      })
      .eq("customer_token", token)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("reservation_slot_locks")
      .delete()
      .eq("location_id", existing.location_id)
      .eq("reservation_date", existing.reservation_date)
      .eq(
        "reservation_time",
        String(existing.reservation_time).slice(0, 5),
      );

    await trackLocationAnalyticsEvent({
      locationId: existing.location_id,
      userId: existing.user_id || null,
      eventType: "reservation_cancelled",
      eventSource: "reservation",
      metadata: {
        party_size: existing.party_size,
        reservation_date: existing.reservation_date,
        reservation_time: existing.reservation_time,
        reservation_id: existing.id,
        cancellation_source: "customer_token",
      },
    });

    const notifiedWaitlist = await notifyFirstWaitlistMatch(
      existing,
      locationName,
    );

    await Promise.allSettled([
      sendReservationCancelledEmail({
        to: existing.customer_email,
        locationName,
        reservationDate: existing.reservation_date,
        reservationTime: existing.reservation_time,
        partySize: existing.party_size,
        confirmationCode:
          existing.confirmation_code || existing.customer_token,
      }),
      sendReservationCancelledSMS({
        to: existing.customer_phone,
        locationName,
        reservationDate: existing.reservation_date,
        reservationTime: existing.reservation_time,
      }),
    ]);

    await logEvent("reservation_audit", {
      action: "customer_cancelled_by_token",
      reservationId: existing.id,
      userId: existing.user_id || null,
      locationId: existing.location_id,
    });

    return NextResponse.json({
      success: true,
      reservation: data,
      notified_waitlist: notifiedWaitlist,
    });
  } catch (error: any) {
    await logEvent("failed_api", {
      route: "reserve_confirmation",
      error: error?.message || "unknown",
    });
    return NextResponse.json(
      { error: error?.message || "Something went wrong." },
      { status: 500 },
    );
  }
}
