import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ACTIVE_RESERVATION_STATUSES, rangesOverlap } from "@/lib/reservationOperations";
import { isBarSeatingType, normalizeSeatingPreference } from "@/lib/reservations/seatingPreference";

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

type Assignment = {
  reservation_id: string;
  seating_resource_id: string;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = clean(searchParams.get("locationId"));
    const locationType = normalizeType(clean(searchParams.get("type")) || "restaurant");
    const reservationDate = clean(searchParams.get("date"));
    const reservationTime = clean(searchParams.get("time")).slice(0, 5);
    const partySize = Math.max(1, Number(searchParams.get("partySize") || 2));
    const preference = normalizeSeatingPreference(searchParams.get("preference"));
    const requestedTimes = Array.from(
      new Set(
        clean(searchParams.get("times"))
          .split(",")
          .map((value) => value.trim().slice(0, 5))
          .filter(Boolean),
      ),
    );

    if (!locationId || !reservationDate) {
      return NextResponse.json(
        { error: "Location and date are required." },
        { status: 400 },
      );
    }

    if (!reservationTime && !requestedTimes.length) {
      return NextResponse.json(
        { error: "A time or list of times is required." },
        { status: 400 },
      );
    }

    const { data: items, error: itemError } = await supabaseAdmin
      .from("location_bookable_items")
      .select("id,item_type,capacity_min,capacity_max,slot_duration_minutes")
      .eq("location_id", locationId)
      .eq("location_type", locationType)
      .eq("is_active", true)
      .lte("capacity_min", partySize)
      .gte("capacity_max", partySize);

    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }

    const allItems = items || [];
    const regularItems = allItems.filter((item: any) => !isBarSeatingType(item.item_type));
    const barItems = allItems.filter((item: any) => isBarSeatingType(item.item_type));
    const fallbackDuration = Math.max(
      1,
      Number(
        [...regularItems, ...barItems]
          .map((item: any) => Number(item.slot_duration_minutes || 0))
          .filter((value) => value > 0)
          .sort((a, b) => a - b)[0] || 90,
      ),
    );

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
    let assignments: Assignment[] = [];
    let barReservations: Reservation[] = [];

    if (seatIds.length) {
      const { data: assignmentRows, error: assignmentError } = await supabaseAdmin
        .from("reservation_resource_assignments")
        .select("reservation_id,seating_resource_id")
        .in("seating_resource_id", seatIds);

      if (assignmentError) {
        return NextResponse.json({ error: assignmentError.message }, { status: 500 });
      }

      assignments = (assignmentRows || []) as Assignment[];
      const reservationIds = Array.from(new Set(assignments.map((row) => row.reservation_id)));

      if (reservationIds.length) {
        const { data: barReservationRows, error: barReservationError } = await supabaseAdmin
          .from("location_reservations")
          .select("id,reservation_time,duration_minutes,turn_time_minutes")
          .in("id", reservationIds)
          .eq("reservation_date", reservationDate)
          .in("status", ACTIVE_RESERVATION_STATUSES);

        if (barReservationError) {
          return NextResponse.json({ error: barReservationError.message }, { status: 500 });
        }
        barReservations = (barReservationRows || []) as Reservation[];
      }
    }

    const byParent = new Map<string, SeatingResource[]>();
    for (const seat of resources) {
      const list = byParent.get(seat.parent_layout_item_id) || [];
      list.push(seat);
      byParent.set(seat.parent_layout_item_id, list);
    }

    const assignmentByReservation = new Map<string, string[]>();
    for (const assignment of assignments) {
      const list = assignmentByReservation.get(assignment.reservation_id) || [];
      list.push(assignment.seating_resource_id);
      assignmentByReservation.set(assignment.reservation_id, list);
    }

    const barDurationByParent = new Map<string, number>();
    for (const item of barItems as any[]) {
      barDurationByParent.set(String(item.id), Math.max(1, Number(item.slot_duration_minutes || fallbackDuration)));
    }

    function diningAvailableAt(time: string) {
      return regularItems.some((item: any) => {
        const itemDuration = Math.max(1, Number(item.slot_duration_minutes || fallbackDuration));
        return !existing.some((reservation) => {
          if (reservation.bookable_item_id !== item.id) return false;
          return rangesOverlap(
            time,
            itemDuration,
            String(reservation.reservation_time || "00:00"),
            Number(reservation.duration_minutes || reservation.turn_time_minutes || itemDuration),
          );
        });
      });
    }

    function barAvailableAt(time: string) {
      for (const [parentId, parentSeats] of byParent.entries()) {
        const ordered = [...parentSeats].sort((a, b) => a.seat_index - b.seat_index);
        if (ordered.length < partySize) continue;
        const duration = barDurationByParent.get(parentId) || fallbackDuration;
        const overlappingReservationIds = new Set(
          barReservations
            .filter((reservation) =>
              rangesOverlap(
                time,
                duration,
                String(reservation.reservation_time || "00:00"),
                Number(reservation.duration_minutes || reservation.turn_time_minutes || duration),
              ),
            )
            .map((reservation) => reservation.id),
        );
        const blockedSeatIds = new Set<string>();
        for (const reservationId of overlappingReservationIds) {
          for (const seatId of assignmentByReservation.get(reservationId) || []) {
            blockedSeatIds.add(seatId);
          }
        }

        for (let index = 0; index <= ordered.length - partySize; index += 1) {
          const block = ordered.slice(index, index + partySize);
          const contiguous = block.every(
            (seat, offset) => seat.seat_index === block[0].seat_index + offset,
          );
          if (contiguous && block.every((seat) => !blockedSeatIds.has(seat.id))) {
            return true;
          }
        }
      }
      return false;
    }

    const diningInventory = regularItems.length > 0;
    const barInventory = Array.from(byParent.values()).some((parentSeats) => parentSeats.length >= partySize);

    function availabilityAt(time: string) {
      const diningAvailable = diningAvailableAt(time);
      const barAvailable = barAvailableAt(time);
      return {
        any: diningAvailable || barAvailable,
        dining: diningAvailable,
        bar: barAvailable,
      };
    }

    if (requestedTimes.length) {
      const availableTimes = requestedTimes.filter((time) => availabilityAt(time)[preference]);
      return NextResponse.json({
        preference,
        available_times: availableTimes,
        dining_inventory: diningInventory,
        bar_inventory: barInventory,
        show_preference: diningInventory && barInventory,
      });
    }

    const availability = availabilityAt(reservationTime);
    return NextResponse.json({
      show_preference: diningInventory && barInventory,
      any_available: availability.any,
      dining: {
        available: availability.dining,
        inventory: diningInventory,
        label: "Table seating",
      },
      bar: {
        available: availability.bar,
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
