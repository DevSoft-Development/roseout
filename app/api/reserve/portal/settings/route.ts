import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";

const DEFAULT_BOOKING = {
  onlineBookingEnabled: true,
  confirmationMode: "instant",
  minimumLeadMinutes: 0,
  allowSameDay: true,
  waitlistEnabled: true,
  guestNotesEnabled: true,
};

const DEFAULT_CAPACITY = {
  defaultDurationMinutes: 90,
  minPartySize: 1,
  maxPartySize: 12,
  slotCapacity: null as number | null,
  bufferMinutes: 0,
  bookingWindowDays: 30,
};

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function optionalInteger(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeBooking(input: any, current: any = {}) {
  const merged = { ...DEFAULT_BOOKING, ...current, ...(input || {}) };
  return {
    onlineBookingEnabled: merged.onlineBookingEnabled !== false,
    confirmationMode:
      merged.confirmationMode === "approval" ? "approval" : "instant",
    minimumLeadMinutes: integer(merged.minimumLeadMinutes, 0, 0, 10080),
    allowSameDay: merged.allowSameDay !== false,
    waitlistEnabled: merged.waitlistEnabled !== false,
    guestNotesEnabled: merged.guestNotesEnabled !== false,
  };
}

function normalizeCapacity(input: any, current: any = {}) {
  const merged = { ...DEFAULT_CAPACITY, ...current, ...(input || {}) };
  const minPartySize = integer(merged.minPartySize, 1, 1, 500);
  const maxPartySize = Math.max(
    minPartySize,
    integer(merged.maxPartySize, 12, minPartySize, 500),
  );
  return {
    defaultDurationMinutes: integer(
      merged.defaultDurationMinutes,
      90,
      30,
      720,
    ),
    minPartySize,
    maxPartySize,
    slotCapacity: optionalInteger(merged.slotCapacity, 1, 500),
    bufferMinutes: integer(merged.bufferMinutes, 0, 0, 240),
    bookingWindowDays: integer(merged.bookingWindowDays, 30, 1, 365),
  };
}

async function readLocation(locationId: string) {
  return supabaseAdmin
    .from("locations")
    .select(
      "id,name,restaurant_name,activity_name,reservation_settings,default_duration_minutes,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled,reservation_guarantee_enabled,large_group_booking_enabled",
    )
    .eq("id", locationId)
    .maybeSingle();
}

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get("locationId") || "";
  const auth = await requireReservePermission(locationId, "viewDashboard");
  if (auth.error) return auth.error;

  const resolvedLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const { data: location, error } = await readLocation(resolvedLocationId);

  if (error) {
    return NextResponse.json(
      { success: false, error: "We could not load reservation settings." },
      { status: 500 },
    );
  }
  if (!location) {
    return NextResponse.json(
      { success: false, error: "Location not found." },
      { status: 404 },
    );
  }

  const settings = (location.reservation_settings as any) || {};
  const stripeReady = Boolean(
    location.stripe_connect_account_id &&
      location.stripe_connect_charges_enabled &&
      location.stripe_connect_payouts_enabled,
  );

  return NextResponse.json({
    success: true,
    location: {
      id: location.id,
      name:
        location.name ||
        location.restaurant_name ||
        location.activity_name ||
        "TheOutHaven location",
    },
    booking: normalizeBooking(settings.booking),
    capacity: normalizeCapacity(settings.capacity),
    reminders: settings.reminders || {},
    stripeReady,
    guaranteeEnabled: Boolean(location.reservation_guarantee_enabled),
    largeGroupsEnabled: Boolean(location.large_group_booking_enabled),
    access: auth.access,
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locationId = String(body.locationId || body.location_id || "").trim();
  const auth = await requireReservePermission(locationId, "manageReservations");
  if (auth.error) return auth.error;

  const resolvedLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const { data: location, error: readError } = await readLocation(resolvedLocationId);
  if (readError || !location) {
    return NextResponse.json(
      {
        success: false,
        error: "We could not load the current reservation settings.",
      },
      { status: readError ? 500 : 404 },
    );
  }

  const current = (location.reservation_settings as any) || {};
  const booking = normalizeBooking(body.booking, current.booking);
  const { error } = await supabaseAdmin
    .from("locations")
    .update({
      reservation_settings: { ...current, booking },
      updated_at: new Date().toISOString(),
    })
    .eq("id", resolvedLocationId);

  if (error) {
    return NextResponse.json(
      { success: false, error: "We could not save reservation settings." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    booking,
    message: "Reservation settings saved.",
  });
}
