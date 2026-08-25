import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ACTIVE_RESERVATION_STATUSES,
  rangesOverlap,
} from "@/lib/reservationOperations";
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

    if (endMinutes - minutes < slotMinutes && minutes < endMinutes) break;
  }

  return slots;
}

function timeToMinutes(value: string) {
  const [hourRaw, minuteRaw = "0"] = String(value || "00:00")
    .slice(0, 5)
    .split(":");
  return Number(hourRaw) * 60 + Number(minuteRaw);
}

function overlaps(
  slotTime: string,
  slotDuration: number,
  bookingTime: string,
  bookingDuration: number,
) {
  const slotStart = timeToMinutes(slotTime);
  const slotEnd = slotStart + slotDuration;
  const bookingStart = timeToMinutes(bookingTime);
  const bookingEnd = bookingStart + bookingDuration;
  return slotStart < bookingEnd && slotEnd > bookingStart;
}

function newYorkClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour") || 0) * 60 + Number(value("minute") || 0),
  };
}

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function minutesUntil(date: string, time: string) {
  const clock = newYorkClock();
  return daysBetween(clock.date, date) * 1440 + timeToMinutes(time) - clock.minutes;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId");
  const locationType = normalizeType(
    searchParams.get("locationType") || "restaurant",
  );
  const date = searchParams.get("date");
  const partySize = Math.max(Number(searchParams.get("partySize") || 2), 1);

  if (!locationId || !date) {
    return NextResponse.json(
      { error: "Missing locationId or date" },
      { status: 400 },
    );
  }

  const tableName = locationType === "activity" ? "activities" : "restaurants";
  const selectFields =
    locationType === "activity"
      ? "id, default_duration_minutes, operating_hours, special_hours, holiday_closures, hours"
      : "id, default_duration_minutes, operating_hours, special_hours, holiday_closures, hours, days_of_operation, kitchen_closing_time";

  const [legacyResult, settingsResult] = await Promise.all([
    supabase.from(tableName).select(selectFields).eq("id", locationId).single(),
    supabaseAdmin
      .from("locations")
      .select("reservation_settings,default_duration_minutes")
      .eq("id", locationId)
      .maybeSingle(),
  ]);

  const location = legacyResult.data as unknown as {
    default_duration_minutes?: number | null;
    operating_hours?: unknown;
    special_hours?: unknown;
    holiday_closures?: unknown;
    hours?: string | null;
    days_of_operation?: string[] | null;
    kitchen_closing_time?: string | null;
  };

  const reservationSettings =
    ((settingsResult.data?.reservation_settings as any) || {}) as Record<
      string,
      any
    >;
  const booking = {
    onlineBookingEnabled:
      reservationSettings.booking?.onlineBookingEnabled !== false,
    confirmationMode:
      reservationSettings.booking?.confirmationMode === "approval"
        ? "approval"
        : "instant",
    minimumLeadMinutes: Math.max(
      Number(reservationSettings.booking?.minimumLeadMinutes || 0),
      0,
    ),
    allowSameDay: reservationSettings.booking?.allowSameDay !== false,
    waitlistEnabled: reservationSettings.booking?.waitlistEnabled !== false,
    guestNotesEnabled: reservationSettings.booking?.guestNotesEnabled !== false,
  };
  const capacity = {
    defaultDurationMinutes: Math.max(
      Number(
        reservationSettings.capacity?.defaultDurationMinutes ||
          settingsResult.data?.default_duration_minutes ||
          location?.default_duration_minutes ||
          90,
      ),
      30,
    ),
    minPartySize: Math.max(
      Number(reservationSettings.capacity?.minPartySize || 1),
      1,
    ),
    maxPartySize: Math.max(
      Number(reservationSettings.capacity?.maxPartySize || 12),
      1,
    ),
    bookingWindowDays: Math.max(
      Number(reservationSettings.capacity?.bookingWindowDays || 30),
      1,
    ),
  };

  const clock = newYorkClock();
  const dayOffset = daysBetween(clock.date, date);
  const baseResponse = {
    durationMinutes: capacity.defaultDurationMinutes,
    minPartySize: capacity.minPartySize,
    maxPartySize: capacity.maxPartySize,
    bookingWindowDays: capacity.bookingWindowDays,
    bookingEnabled: booking.onlineBookingEnabled,
    waitlistEnabled: booking.waitlistEnabled,
    guestNotesEnabled: booking.guestNotesEnabled,
    confirmationMode: booking.confirmationMode,
  };

  if (!booking.onlineBookingEnabled) {
    return NextResponse.json({
      ...baseResponse,
      slots: [],
      reason: "Online reservations are currently paused for this location.",
    });
  }

  if (dayOffset < 0 || dayOffset > capacity.bookingWindowDays) {
    return NextResponse.json({
      ...baseResponse,
      slots: [],
      reason:
        dayOffset > capacity.bookingWindowDays
          ? `Reservations open ${capacity.bookingWindowDays} days in advance.`
          : "Please choose a future date.",
    });
  }

  if (!booking.allowSameDay && dayOffset === 0) {
    return NextResponse.json({
      ...baseResponse,
      slots: [],
      reason: "Same-day online reservations are not available.",
    });
  }

  if (partySize < capacity.minPartySize || partySize > capacity.maxPartySize) {
    return NextResponse.json({
      ...baseResponse,
      slots: [],
      reason: `Online reservations are available for parties of ${capacity.minPartySize}–${capacity.maxPartySize}.`,
    });
  }

  const durationMinutes = capacity.defaultDurationMinutes;

  const { data: reservations } = await supabase
    .from("location_reservations")
    .select(
      "id, bookable_item_id, reservation_time, duration_minutes, turn_time_minutes, status",
    )
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

  const leadEligibleSlots = slots.filter(
    (slot) => minutesUntil(date, slot) >= booking.minimumLeadMinutes,
  );
  const usableLayoutItems = layoutItems || [];

  const layoutAvailableSlots = leadEligibleSlots.filter((slot) => {
    if (usableLayoutItems.length) {
      return usableLayoutItems.some((item) =>
        !(reservations || []).some((reservation) => {
          if (reservation.bookable_item_id !== item.id) return false;
          return rangesOverlap(
            slot,
            durationMinutes,
            String(reservation.reservation_time || "00:00"),
            Number(
              reservation.duration_minutes ||
                reservation.turn_time_minutes ||
                durationMinutes,
            ),
          );
        }),
      );
    }

    return !(reservations || []).some((reservation) =>
      overlaps(
        slot,
        durationMinutes,
        String(reservation.reservation_time || "00:00"),
        Number(
          reservation.duration_minutes ||
            reservation.turn_time_minutes ||
            durationMinutes,
        ),
      ),
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
        party_size: partySize,
      }),
    })),
  );

  const availableSlots = availabilityResults
    .filter((result) => result.availability.available)
    .map((result) => result.slot);

  return NextResponse.json({
    ...baseResponse,
    slots: availableSlots,
    reason:
      availableSlots.length === 0 && booking.minimumLeadMinutes > 0
        ? "No reservation times are available within the current booking rules."
        : undefined,
  });
}
