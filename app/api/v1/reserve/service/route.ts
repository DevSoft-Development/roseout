import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const SHIFT_STATUSES = new Set(["scheduled", "active", "break", "cut", "clocked_out", "unavailable"]);
const ASSIGNMENT_MODES = new Set(["manual", "rotation", "balanced"]);

export async function GET(request: NextRequest) {
  const locationId = clean(request.nextUrl.searchParams.get("locationId"));
  const date = clean(request.nextUrl.searchParams.get("date")) || new Date().toISOString().slice(0, 10);
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  const auth = await requireReservePermission(locationId, "viewDashboard");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const [settings, sections, shifts] = await Promise.all([
    supabaseAdmin.from("reserve_service_settings").select("*").eq("location_id", canonicalLocationId).maybeSingle(),
    supabaseAdmin.from("reserve_service_sections").select("*").eq("location_id", canonicalLocationId).eq("is_active", true).order("sort_order"),
    supabaseAdmin.from("reserve_staff_shifts").select("*").eq("location_id", canonicalLocationId).eq("service_date", date),
  ]);
  const missingSchema = [settings.error, sections.error, shifts.error].some((error) => error?.code === "42P01");
  return NextResponse.json({
    success: !missingSchema,
    schemaReady: !missingSchema,
    settings: settings.data || null,
    sections: sections.data || [],
    shifts: shifts.data || [],
  }, { headers: { "Cache-Control": "no-store", "X-TheOutHaven-API-Lane": "reserve-v1" } });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const locationId = clean(body.locationId || body.location_id);
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  const auth = await requireReservePermission(locationId, "manageReservations");
  if (auth.error) return auth.error;
  if (!["location_admin", "manager"].includes(String(auth.access?.role || ""))) {
    return NextResponse.json({ success: false, error: "Manager access is required to change service controls." }, { status: 403 });
  }
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const updates: Record<string, any> = { location_id: canonicalLocationId, updated_at: new Date().toISOString() };
  if (body.assignmentMode !== undefined && ASSIGNMENT_MODES.has(clean(body.assignmentMode))) updates.assignment_mode = clean(body.assignmentMode);
  if (body.includeBarInAutoAssignment !== undefined) updates.include_bar_in_auto_assignment = Boolean(body.includeBarInAutoAssignment);
  for (const [input, column] of [
    ["maxCovers15m", "max_covers_15m"],
    ["maxCovers30m", "max_covers_30m"],
    ["walkinReserveCovers", "walkin_reserve_covers"],
    ["lateGraceMinutes", "late_grace_minutes"],
    ["offlineSnapshotMinutes", "offline_snapshot_minutes"],
  ] as const) {
    if (body[input] !== undefined) {
      const value = Number(body[input]);
      updates[column] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
    }
  }
  if (body.floorFocusDefault !== undefined) updates.floor_focus_default = Boolean(body.floorFocusDefault);
  const { data, error } = await supabaseAdmin
    .from("reserve_service_settings")
    .upsert(updates, { onConflict: "location_id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ success: false, error: "Unable to update Reserve service controls." }, { status: 500 });
  await supabaseAdmin.from("reserve_service_events").insert({
    location_id: canonicalLocationId,
    event_type: "service.settings_updated",
    metadata: { assignment_mode: data.assignment_mode },
  });
  return NextResponse.json({ success: true, settings: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = clean(body.action);
  const locationId = clean(body.locationId || body.location_id);
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  const auth = await requireReservePermission(locationId, "manageTeam");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);

  if (action === "upsert_section") {
    const name = clean(body.name);
    if (!name) return NextResponse.json({ success: false, error: "Enter a section name." }, { status: 400 });
    const payload = {
      location_id: canonicalLocationId,
      name,
      area_key: clean(body.areaKey || body.area_key) || null,
      sort_order: Number(body.sortOrder ?? body.sort_order ?? 0) || 0,
      is_active: body.isActive !== false,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from("reserve_service_sections")
      .upsert(payload, { onConflict: "location_id,name" })
      .select("*")
      .single();
    if (error) return NextResponse.json({ success: false, error: "Unable to save service section." }, { status: 500 });
    return NextResponse.json({ success: true, section: data });
  }

  if (action === "upsert_shift") {
    const staffProfileId = clean(body.staffProfileId || body.staff_profile_id);
    const serviceDate = clean(body.serviceDate || body.service_date);
    const status = clean(body.status) || "active";
    if (!staffProfileId || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !SHIFT_STATUSES.has(status)) {
      return NextResponse.json({ success: false, error: "Choose staff, date, and a valid shift status." }, { status: 400 });
    }
    const staff = await supabaseAdmin
      .from("reserve_staff_profiles")
      .select("id")
      .eq("id", staffProfileId)
      .eq("location_id", canonicalLocationId)
      .maybeSingle();
    if (!staff.data) return NextResponse.json({ success: false, error: "Staff profile is not part of this location." }, { status: 404 });
    const shiftId = clean(body.shiftId || body.id);
    const payload: Record<string, any> = {
      location_id: canonicalLocationId,
      staff_profile_id: staffProfileId,
      section_id: clean(body.sectionId || body.section_id) || null,
      service_date: serviceDate,
      status,
      starts_at: clean(body.startsAt || body.starts_at) || null,
      ends_at: clean(body.endsAt || body.ends_at) || null,
      max_tables: body.maxTables == null ? null : Math.max(0, Number(body.maxTables) || 0),
      max_covers: body.maxCovers == null ? null : Math.max(0, Number(body.maxCovers) || 0),
      notes: clean(body.notes) || null,
      updated_at: new Date().toISOString(),
    };
    let query = shiftId
      ? supabaseAdmin.from("reserve_staff_shifts").update(payload).eq("id", shiftId).eq("location_id", canonicalLocationId)
      : supabaseAdmin.from("reserve_staff_shifts").insert(payload);
    const { data, error } = await query.select("*").single();
    if (error) return NextResponse.json({ success: false, error: "Unable to save staff shift." }, { status: 500 });
    return NextResponse.json({ success: true, shift: data });
  }

  return NextResponse.json({ success: false, error: "Unsupported service action." }, { status: 400 });
}
