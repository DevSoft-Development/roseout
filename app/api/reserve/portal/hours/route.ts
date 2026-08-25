import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";

const CAP = {
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

function normalizeCapacity(input: any, current: any = {}) {
  const merged = { ...CAP, ...current, ...(input || {}) };
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

function safeHours(value: unknown) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value;
}

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId") || "";
  const auth = await requireReservePermission(locationId, "viewDashboard");
  if (auth.error) return auth.error;
  const resolvedLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const { data: loc } = await supabaseAdmin
    .from("locations")
    .select(
      "operating_hours,special_hours,google_current_opening_hours,google_regular_opening_hours,reservation_settings,default_duration_minutes",
    )
    .eq("id", resolvedLocationId)
    .maybeSingle();
  const settings = (loc?.reservation_settings as any) || {};
  const capacity = normalizeCapacity(
    settings.capacity,
    loc?.default_duration_minutes
      ? { defaultDurationMinutes: loc.default_duration_minutes }
      : undefined,
  );
  return NextResponse.json({
    success: true,
    hours:
      loc?.operating_hours ||
      loc?.google_current_opening_hours ||
      loc?.google_regular_opening_hours ||
      null,
    specialHours: loc?.special_hours || null,
    capacity,
    canEdit: Boolean(auth.access.permissions.manageHours),
    access: auth.access,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const locationId = String(body.locationId || "");
  const auth = await requireReservePermission(locationId, "manageHours");
  if (auth.error) return auth.error;
  const resolvedLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const { data: loc } = await supabaseAdmin
    .from("locations")
    .select("reservation_settings,default_duration_minutes")
    .eq("id", resolvedLocationId)
    .maybeSingle();
  const current = (loc?.reservation_settings as any) || {};
  const capacity = normalizeCapacity(
    body.capacity,
    current.capacity || {
      defaultDurationMinutes: loc?.default_duration_minutes || 90,
    },
  );
  const update: any = {
    reservation_settings: { ...current, capacity },
    default_duration_minutes: capacity.defaultDurationMinutes,
    updated_at: new Date().toISOString(),
  };

  if (body.hours !== undefined) {
    const hours = safeHours(body.hours);
    if (hours === undefined) {
      return NextResponse.json(
        { success: false, error: "Hours must be saved as a weekly schedule." },
        { status: 400 },
      );
    }
    update.operating_hours = hours;
  }

  if (body.specialHours !== undefined) {
    const specialHours = safeHours(body.specialHours);
    if (specialHours === undefined) {
      return NextResponse.json(
        { success: false, error: "Special hours must be saved by date." },
        { status: 400 },
      );
    }
    update.special_hours = specialHours;
  }

  const { error } = await supabaseAdmin
    .from("locations")
    .update(update)
    .eq("id", resolvedLocationId);
  if (error) {
    return NextResponse.json(
      { success: false, error: "We could not save hours and capacity." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    success: true,
    capacity,
    message: "Hours and capacity saved.",
  });
}
