import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireReservePermission } from "@/lib/reserve/locationPermissions";

const CAP = {
  defaultDurationMinutes: 90,
  minPartySize: 1,
  maxPartySize: 12,
  slotCapacity: null,
  bufferMinutes: 0,
  bookingWindowDays: 30,
};

function canonicalLocationId(auth: any, fallback: string) {
  return String(auth.access?.location?.id || fallback);
}

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId") || "";
  const auth = await requireReservePermission(locationId, "viewDashboard");
  if (auth.error) return auth.error;
  const resolvedLocationId = canonicalLocationId(auth, locationId);
  const { data: loc } = await supabaseAdmin
    .from("locations")
    .select("operating_hours,special_hours,google_current_opening_hours,google_regular_opening_hours,reservation_settings")
    .eq("id", resolvedLocationId)
    .maybeSingle();
  const settings = (loc?.reservation_settings as any) || {};
  return NextResponse.json({
    success: true,
    hours: loc?.operating_hours || loc?.google_current_opening_hours || loc?.google_regular_opening_hours || null,
    specialHours: loc?.special_hours || null,
    capacity: { ...CAP, ...(settings.capacity || {}) },
    canEdit: Boolean(auth.access.permissions.manageHours),
    access: auth.access,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const locationId = String(body.locationId || "");
  const auth = await requireReservePermission(locationId, "manageHours");
  if (auth.error) return auth.error;
  const resolvedLocationId = canonicalLocationId(auth, locationId);
  const { data: loc } = await supabaseAdmin
    .from("locations")
    .select("reservation_settings")
    .eq("id", resolvedLocationId)
    .maybeSingle();
  const current = (loc?.reservation_settings as any) || {};
  const update: any = {
    reservation_settings: {
      ...current,
      capacity: { ...CAP, ...(current.capacity || {}), ...(body.capacity || {}) },
    },
  };
  if (body.hours !== undefined) update.operating_hours = body.hours;
  const { error } = await supabaseAdmin.from("locations").update(update).eq("id", resolvedLocationId);
  if (error) return NextResponse.json({ success: false, error: "We could not save hours and capacity." }, { status: 500 });
  return NextResponse.json({ success: true, message: "Hours and capacity saved." });
}
