import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ACTIVE_RESERVATION_STATUSES, rangesOverlap } from "@/lib/reservationOperations";
import {
  getOperatingHoursForDate,
  timeWindowToSlots,
} from "@/lib/locationHours";
import { checkReservationAvailability } from "@/lib/reservations/availability";

function normalizeType(value: string) {
  const type = value.toLowerCase().trim();
  if (["activity", "activities"].includes(type)) return "activity";
  return "restaurant";
}

function buildSlots(durationMinutes: number) {
  const slots: string[] = [];
  const startHour = 17;
  const endHour = 22;
  const slotMinutes = Math.min(Math.max(durationMinutes, 30), 120);
  let minutes = startHour * 60;
  const endMinutes = endHour * 60;

  while (minutes < endMinutes) {
    const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
    const minute = (minutes % 60).toString().padStart(2, "0");
    slots.push(`${hour}:${minute}`);
    minutes += 30;

    if (endMinutes - minutes < slotMinutes && minutes < endMinutes) {
      break;
    }
  }

  return slots;
}

function timeToMinutes(value: string) {
  const [hourRaw, minuteRaw = "0"] = String(value || "00:00").slice(0, 5).split(":");
  return Number(hourRaw) * 60 + Number(minuteRaw);
}

function overlaps(
  slotTime: string,
  slotDuration: number,
  bookingTime: string,
  bookingDuration: number
) {
  const slotStart = timeToMinutes(slotTime);
  const slotEnd = slotStart + slotDuration;
  const bookingStart = timeToMinutes(bookingTime);
  const bookingEnd = bookingStart + bookingDuration;

  return slotStart < bookingEnd && slotEnd > bookingStart;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const locationId = searchParams.get("locationId");
  const locationType = normalizeType(searchParams.get("locationType") || "restaurant");
  const date = searchParams.get("date");

  if (!locationId || !date) {
    return NextResponse.json(
      { error: "Missing locationId or date" },
      { status: 400 }
    );
  }

  const tableName = locationType === "activity" ? "activities" : "restaurants";

  const selectFields =
    locationType === "activity"
      ? "id, default_duration_minutes, operating_hours, special_hours, holiday_closures, hours"
      : "id, default_duration_minutes, operating_hours, special_hours, holiday_closures, hours, days_of_operation, kitchen_closing_time";

  const { data: locationData } = await supabase
    .from(tableName)
    .select(selectFields)
    .eq("id", locationId)
    .single();

  const location = locationData as unknown as {
    default_duration_minutes?: number | null;
    operating_hours?: unknown;
    special_hours?: unknown;
    holiday_closures?: unknown;
    hours?: string | null;
    days_of_operation?: string[] | null;
    kitchen_closing_time?: string | null;
  };
  const durationMinutes = location?.default_duration_minutes || 90;

  const { data: reservations } = await supabase
    .from("location_reservations")
    .select("id, bookable_item_id, reservation_time, duration_minutes, turn_time_minutes, status")
    .eq("location_id", locationId)
    .eq("location_type", locationType)
    .eq("reservation_date", date)
    .in("status", ACTIVE_RESERVATION_STATUSES);

  const { data: layoutItems } = await supabase
    .from("layout_items")
    .select("id, capacity, status, is_active")
    .eq("location_id", locationId)
    .eq("source_table", locationType)
    .eq("is_active", true)
    .not("status", "in", "(blocked,maintenance)");

  const structuredHours = getOperatingHoursForDate(location || {}, date);
  const slots = structuredHours
    ? timeWindowToSlots(structuredHours, durationMinutes)
    : buildSlots(durationMinutes);

  const usableLayoutItems = layoutItems || [];

  const layoutAvailableSlots = slots.filter((slot) => {
    if (usableLayoutItems.length) {
      return usableLayoutItems.some((item) => {
        return !(reservations || []).some((reservation) => {
          if (reservation.bookable_item_id !== item.id) return false;
          return rangesOverlap(
            slot,
            durationMinutes,
            String(reservation.reservation_time || "00:00"),
            Number(reservation.duration_minutes || reservation.turn_time_minutes || durationMinutes),
          );
        });
      });
    }

    return !(reservations || []).some((reservation) =>
      overlaps(
        slot,
        durationMinutes,
        String(reservation.reservation_time || "00:00"),
        Number(reservation.duration_minutes || reservation.turn_time_minutes || durationMinutes)
      )
    );
  });

  const availabilityResults = await Promise.all(
    layoutAvailableSlots.map(async (slot) => ({
      slot,
      availability: await checkReservationAvailability({
        location_id: locationId,
        location_type: locationType,
        reservation_date: date,
        reservation_time: slot,
        party_size: 2,
      }),
    })),
  );

  const availableSlots = availabilityResults
    .filter((result) => result.availability.available)
    .map((result) => result.slot);

  return NextResponse.json({
    durationMinutes,
    slots: availableSlots,
  });
}
