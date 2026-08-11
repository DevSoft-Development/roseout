import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ACTIVE_RESERVATION_STATUSES, rangesOverlap } from "@/lib/reservationOperations";
import { POST as createReservation } from "../route";

type CandidateItem = {
  id: string;
  capacity_min?: number | null;
  capacity_max?: number | null;
  slot_duration_minutes?: number | null;
};

type ExistingReservation = {
  id: string;
  bookable_item_id?: string | null;
  reservation_time?: string | null;
  duration_minutes?: number | null;
  turn_time_minutes?: number | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeType(value: string) {
  const type = value.toLowerCase().trim();
  if (["activity", "activities"].includes(type)) return "activity";
  if (["bar", "bars"].includes(type)) return "bar";
  if (["lounge", "lounges"].includes(type)) return "lounge";
  if (["venue", "venues"].includes(type)) return "venue";
  return "restaurant";
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const locationId = cleanString(body.location_id);
  const locationType = normalizeType(cleanString(body.location_type));
  const reservationDate = cleanString(body.reservation_date);
  const reservationTime = cleanString(body.reservation_time).slice(0, 5);
  const rescheduleToken = cleanString(body.reschedule_token);
  const partySize = Number(body.party_size || 2);

  if (!locationId || !reservationDate || !reservationTime) {
    return NextResponse.json({ error: "Please select a date and time." }, { status: 400 });
  }

  if (!Number.isFinite(partySize) || partySize < 1) {
    return NextResponse.json({ error: "Please enter a valid party size." }, { status: 400 });
  }

  const { data: candidates, error: candidateError } = await supabaseAdmin
    .from("location_bookable_items")
    .select("id, capacity_min, capacity_max, slot_duration_minutes")
    .eq("location_id", locationId)
    .eq("location_type", locationType)
    .eq("is_active", true)
    .lte("capacity_min", partySize)
    .gte("capacity_max", partySize)
    .order("capacity_max", { ascending: true })
    .order("capacity_min", { ascending: false });

  if (candidateError) {
    return NextResponse.json({ error: candidateError.message }, { status: 500 });
  }

  const compatible = (candidates || []) as CandidateItem[];
  if (!compatible.length) {
    return NextResponse.json(
      { error: "No reservation space is available for this party size.", waitlist_available: true },
      { status: 409 },
    );
  }

  let excludeReservationId = "";
  if (rescheduleToken) {
    const { data: existing } = await supabaseAdmin
      .from("location_reservations")
      .select("id")
      .eq("customer_token", rescheduleToken)
      .maybeSingle();
    excludeReservationId = cleanString(existing?.id);
  }

  let reservationsQuery = supabaseAdmin
    .from("location_reservations")
    .select("id, bookable_item_id, reservation_time, duration_minutes, turn_time_minutes")
    .eq("location_id", locationId)
    .eq("location_type", locationType)
    .eq("reservation_date", reservationDate)
    .in("status", ACTIVE_RESERVATION_STATUSES);

  if (excludeReservationId) {
    reservationsQuery = reservationsQuery.neq("id", excludeReservationId);
  }

  const { data: reservations, error: reservationsError } = await reservationsQuery;
  if (reservationsError) {
    return NextResponse.json({ error: reservationsError.message }, { status: 500 });
  }

  const existingReservations = (reservations || []) as ExistingReservation[];
  const selectedItem = compatible.find((item) => {
    const requestedDuration = Number(item.slot_duration_minutes || 90);
    return !existingReservations.some((reservation) => {
      if (reservation.bookable_item_id !== item.id) return false;
      return rangesOverlap(
        reservationTime,
        requestedDuration,
        String(reservation.reservation_time || "00:00"),
        Number(reservation.duration_minutes || reservation.turn_time_minutes || requestedDuration),
      );
    });
  });

  if (!selectedItem) {
    return NextResponse.json(
      { error: "That time is no longer available for your party size.", waitlist_available: true },
      { status: 409 },
    );
  }

  const delegatedRequest = new NextRequest(new URL("/api/reserve/location", request.url), {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      ...body,
      location_type: locationType,
      reservation_time: reservationTime,
      bookable_item_id: selectedItem.id,
    }),
  });

  return createReservation(delegatedRequest);
}
