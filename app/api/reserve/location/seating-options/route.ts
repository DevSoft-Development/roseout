import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ACTIVE_RESERVATION_STATUSES, rangesOverlap } from "@/lib/reservationOperations";

function clean(value: unknown) {
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

function normalizedItemType(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, "_");
}

function isBarItem(value: unknown) {
  return ["bar", "bar_seat", "counter", "counter_seat"].includes(
    normalizedItemType(value),
  );
}

type SeatingResource = {
  id: string;
  parent_layout_item_id: string;
  seat_index: number;
};

type Reservation = {
  id: string;
  bookable_item_id?: string | null;
  reservation_time?: string | null;
  duration_minutes?: number | null;
  turn_time_minutes?: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = clean(searchParams.get("locationId"));
    const locationType = normalizeType(clean(searchParams.get("type")) || "restaurant");
    const reservationDate = clean(searchParams.get("date"));
    const reservationTime = clean(searchParams.get("time")).slice(0, 5);
    const partySize = Math.max(1, Number(searchParams.get("partySize") || 2));

    if (!locationId || !reservationDate || !reservationTime) {
      return NextResponse.json(
        { error: "Location, date, and time are required." },
        { status: 400 },
      );
    }

    const [{ data: location, error: locationError }, { data: items, error: itemError }] =
      await Promise.all([
        supabaseAdmin
          .from("locations")
          .select("default_duration_minutes")
          .eq("id", locationId)
          .maybeSingle(),
        supabaseAdmin
          .from("location_bookable_items")
          .select("id,item_type,capacity_min,capacity_max,slot_duration_minutes")
          .eq("location_id", locationId)
          .eq("location_type", locationType)
          .eq("is_active", true)
          .lte("capacity_min", partySize)
          .gte("capacity_max", partySize),
      ]);

    if (locationError) {
      return NextResponse.json({ error: locationError.message }, { status: 500 });
    }
    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }

    const duration = Math.max(1, Number(location?.default_duration_minutes || 90));
    const regularItems = (items || []).filter((item: any) => !isBarItem(item.item_type));

    const { data: reservations, error: reservationsError } = await supabaseAdmin
      .from("location_reservations")
      .select("id,bookable_item_id,reservation_time,duration_minutes,turn_time_minutes")
      .eq("location_id", locationId)
      .eq("location_type", locationType)
      .eq("reservation_date", reservationDate)
      .in("status", ACTIVE_RESERVATION_STATUSES);

    if (reservationsError) {
      return NextResponse.json({ error: reservationsError.message }, { status: 500 });
    }

    const existing = (reservations || []) as Reservation[];
    const diningAvailable = regularItems.some((item: any) => {
      const itemDuration = Math.max(1, Number(item.slot_duration_minutes || duration));
      return !existing.some((reservation) => {
        if (reservation.bookable_item_id !== item.id) return false;
        return rangesOverlap(
          reservationTime,
          itemDuration,
          String(reservation.reservation_time || "00:00"),
          Number(
            reservation.duration_minutes ||
              reservation.turn_time_minutes ||
              itemDuration,
          ),
        );
      });
    });

    const { data: seats, error: seatsError } = await supabaseAdmin
      .from("reservation_seating_resources")
      .select("id,parent_layout_item_id,seat_index")
      .eq("location_id", locationId)
      .eq("is_active", true)
      .order("parent_layout_item_id", { ascending: true })
      .order("seat_index", { ascending: true });

    if (seatsError) {
      return NextResponse.json({ error: seatsError.message }, { status: 500 });
    }

    const resources = (seats || []) as SeatingResource[];
    const seatIds = resources.map((seat) => seat.id);
    let blockedSeatIds = new Set<string>();

    if (seatIds.length) {
      const { data: assignments, error: assignmentError } = await supabaseAdmin
        .from("reservation_resource_assignments")
        .select("reservation_id,seating_resource_id")
        .in("seating_resource_id", seatIds);

      if (assignmentError) {
        return NextResponse.json({ error: assignmentError.message }, { status: 500 });
      }

      const reservationIds = Array.from(
        new Set((assignments || []).map((row: any) => String(row.reservation_id))),
      );

      if (reservationIds.length) {
        const { data: barReservations, error: barReservationError } = await supabaseAdmin
          .from("location_reservations")
          .select("id,reservation_time,duration_minutes,turn_time_minutes,status")
          .in("id", reservationIds)
          .eq("reservation_date", reservationDate)
          .in("status", ACTIVE_RESERVATION_STATUSES);

        if (barReservationError) {
          return NextResponse.json(
            { error: barReservationError.message },
            { status: 500 },
          );
        }

        const overlappingIds = new Set(
          (barReservations || [])
            .filter((reservation: any) =>
              rangesOverlap(
                reservationTime,
                duration,
                String(reservation.reservation_time || "00:00"),
                Number(
                  reservation.duration_minutes ||
                    reservation.turn_time_minutes ||
                    duration,
                ),
              ),
            )
            .map((reservation: any) => String(reservation.id)),
        );

        blockedSeatIds = new Set(
          (assignments || [])
            .filter((row: any) => overlappingIds.has(String(row.reservation_id)))
            .map((row: any) => String(row.seating_resource_id)),
        );
      }
    }

    const byParent = new Map<string, SeatingResource[]>();
    for (const seat of resources) {
      const list = byParent.get(seat.parent_layout_item_id) || [];
      list.push(seat);
      byParent.set(seat.parent_layout_item_id, list);
    }

    let barInventory = false;
    let barAvailable = false;
    for (const parentSeats of byParent.values()) {
      const ordered = [...parentSeats].sort((a, b) => a.seat_index - b.seat_index);
      if (ordered.length >= partySize) barInventory = true;
      for (let index = 0; index <= ordered.length - partySize; index += 1) {
        const block = ordered.slice(index, index + partySize);
        const contiguous = block.every(
          (seat, offset) => seat.seat_index === block[0].seat_index + offset,
        );
        if (contiguous && block.every((seat) => !blockedSeatIds.has(seat.id))) {
          barAvailable = true;
          break;
        }
      }
      if (barAvailable) break;
    }

    const diningInventory = regularItems.length > 0;
    const showPreference = diningAvailable && barAvailable;

    return NextResponse.json({
      show_preference: showPreference,
      any_available: diningAvailable || barAvailable,
      dining: {
        available: diningAvailable,
        inventory: diningInventory,
        label: "Table seating",
      },
      bar: {
        available: barAvailable,
        inventory: barInventory,
        label: "Bar seating",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to check seating availability." },
      { status: 500 },
    );
  }
}
