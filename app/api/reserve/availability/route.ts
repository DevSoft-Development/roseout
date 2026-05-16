import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  getOperatingHoursForDate,
  timeWindowToSlots,
} from "@/lib/locationHours";

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

  const { data: location } = await supabase
    .from(tableName)
    .select(
      "id, default_duration_minutes, operating_hours, special_hours, holiday_closures, hours, days_of_operation, kitchen_closing_time"
    )
    .eq("id", locationId)
    .single();

  const durationMinutes = location?.default_duration_minutes || 90;

  const { data: reservations } = await supabase
    .from("location_reservations")
    .select("id, reservation_time, status")
    .eq("location_id", locationId)
    .eq("location_type", locationType)
    .eq("reservation_date", date)
    .in("status", ["pending", "confirmed", "arrived"]);

  const structuredHours = getOperatingHoursForDate(location || {}, date);
  const slots = structuredHours
    ? timeWindowToSlots(structuredHours, durationMinutes)
    : buildSlots(durationMinutes);

  const availableSlots = slots.filter((slot) => {
    return !(reservations || []).some((reservation) =>
      overlaps(
        slot,
        durationMinutes,
        String(reservation.reservation_time || "00:00"),
        durationMinutes
      )
    );
  });

  return NextResponse.json({
    durationMinutes,
    slots: availableSlots,
  });
}
