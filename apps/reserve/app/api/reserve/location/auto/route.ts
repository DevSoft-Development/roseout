import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ACTIVE_RESERVATION_STATUSES, rangesOverlap } from "@/lib/reservationOperations";
import { POST as createReservation } from "../route";

type CandidateItem = {
  id: string;
  item_name?: string | null;
  item_type?: string | null;
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

type SeatingPreference = "any" | "dining" | "bar";

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

function normalizeSeatingPreference(value: unknown): SeatingPreference {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "bar") return "bar";
  if (normalized === "dining" || normalized === "table") return "dining";
  return "any";
}

function isBarItem(value: unknown) {
  const normalized = cleanString(value).toLowerCase().replace(/\s+/g, "_");
  return ["bar", "bar_seat", "counter", "counter_seat"].includes(normalized);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const locationId = cleanString(body.location_id);
  const locationType = normalizeType(cleanString(body.location_type));
  const reservationDate = cleanString(body.reservation_date);
  const reservationTime = cleanString(body.reservation_time).slice(0, 5);
  const rescheduleToken = cleanString(body.reschedule_token);
  const partySize = Number(body.party_size || 2);
  const seatingPreference = normalizeSeatingPreference(body.seating_preference);

  if (!locationId || !reservationDate || !reservationTime) {
    return NextResponse.json({ error: "Please select a date and time." }, { status: 400 });
  }

  if (!Number.isFinite(partySize) || partySize < 1) {
    return NextResponse.json({ error: "Please enter a valid party size." }, { status: 400 });
  }

  const { data: candidates, error: candidateError } = await supabaseAdmin
    .from("location_bookable_items")
    .select("id, item_name, item_type, capacity_min, capacity_max, slot_duration_minutes")
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

  const allCompatible = (candidates || []) as CandidateItem[];
  const compatible = allCompatible.filter((item) => {
    if (seatingPreference === "bar") return isBarItem(item.item_type);
    if (seatingPreference === "dining") return !isBarItem(item.item_type);
    return true;
  });

  if (!compatible.length) {
    const preferenceMessage =
      seatingPreference === "bar"
        ? "Bar seating is not available for this party size."
        : seatingPreference === "dining"
          ? "Table seating is not available for this party size."
          : "No reservation space is available for this party size.";
    return NextResponse.json(
      { error: preferenceMessage, waitlist_available: true },
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
    // Bar/counter conflicts are finally enforced by the individual-stool assignment
    // trigger. This check handles aggregate option collisions when an ID is retained.
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
    const preferenceMessage =
      seatingPreference === "bar"
        ? "Bar seating is no longer available at that time."
        : seatingPreference === "dining"
          ? "Table seating is no longer available at that time."
          : "That time is no longer available for your party size.";
    return NextResponse.json(
      { error: preferenceMessage, waitlist_available: true },
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
