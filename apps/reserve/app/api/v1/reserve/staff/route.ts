import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";
import {
  createReserveStaffSession,
  getReserveStaffSession,
  revokeReserveStaffSession,
} from "@/lib/reserve/staffSession";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const STAFF_ROLES = new Set(["server", "bartender", "host", "lead_host", "manager"]);

export async function GET(request: NextRequest) {
  const locationId = clean(request.nextUrl.searchParams.get("locationId"));
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  const auth = await requireReservePermission(locationId, "viewDashboard");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const [{ data: profiles, error }, session] = await Promise.all([
    supabaseAdmin
      .from("reserve_staff_profiles")
      .select("id,location_id,team_member_id,display_name,role,pin_length,is_active,can_quick_switch,failed_pin_attempts,pin_locked_until,created_at,updated_at")
      .eq("location_id", canonicalLocationId)
      .eq("is_active", true)
      .order("display_name", { ascending: true }),
    getReserveStaffSession(canonicalLocationId),
  ]);
  if (error) {
    const missing = error.code === "42P01" || String(error.message || "").includes("does not exist");
    return NextResponse.json({ success: missing, schemaReady: false, staff: [], session: null, error: missing ? undefined : "Unable to load Reserve staff." }, { status: missing ? 200 : 500 });
  }
  return NextResponse.json({
    success: true,
    schemaReady: true,
    staff: profiles || [],
    session: session ? {
      id: session.id,
      staffProfileId: session.staff_profile_id,
      profile: session.reserve_staff_profiles,
      expiresAt: session.expires_at,
    } : null,
  }, { headers: { "Cache-Control": "no-store", "X-TheOutHaven-API-Lane": "reserve-v1" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = clean(body.action);
  const locationId = clean(body.locationId || body.location_id);
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });

  if (action === "verify_pin") {
    const auth = await requireReservePermission(locationId, "viewDashboard");
    if (auth.error) return auth.error;
    const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
    const staffProfileId = clean(body.staffProfileId || body.staff_profile_id);
    const pin = clean(body.pin);
    if (!staffProfileId || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ success: false, error: "Enter your 4–6 digit PIN." }, { status: 400 });
    }
    const profile = await supabaseAdmin
      .from("reserve_staff_profiles")
      .select("id,display_name,role,is_active,can_quick_switch")
      .eq("id", staffProfileId)
      .eq("location_id", canonicalLocationId)
      .maybeSingle();
    if (profile.error || !profile.data || profile.data.is_active === false || profile.data.can_quick_switch === false) {
      return NextResponse.json({ success: false, error: "Staff profile is unavailable." }, { status: 404 });
    }
    const verify = await supabaseAdmin.rpc("reserve_verify_staff_pin", {
      p_staff_profile_id: staffProfileId,
      p_pin: pin,
    });
    if (verify.error || verify.data !== true) {
      return NextResponse.json({ success: false, error: "Incorrect PIN. Try again." }, { status: 401 });
    }
    const session = await createReserveStaffSession({
      locationId: canonicalLocationId,
      staffProfileId,
      deviceLabel: clean(body.deviceLabel) || request.headers.get("user-agent")?.slice(0, 120) || null,
    });
    await supabaseAdmin.from("reserve_service_events").insert({
      location_id: canonicalLocationId,
      staff_profile_id: staffProfileId,
      event_type: "staff.quick_switch_login",
      metadata: { role: profile.data.role },
    });
    return NextResponse.json({ success: true, profile: profile.data, session });
  }

  if (action === "logout") {
    const auth = await requireReservePermission(locationId, "viewDashboard");
    if (auth.error) return auth.error;
    await revokeReserveStaffSession();
    return NextResponse.json({ success: true });
  }

  const auth = await requireReservePermission(locationId, "manageTeam");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);

  if (action === "create_profile") {
    const displayName = clean(body.displayName || body.display_name);
    const role = clean(body.role) || "server";
    if (!displayName || !STAFF_ROLES.has(role)) {
      return NextResponse.json({ success: false, error: "Enter a staff name and valid Reserve role." }, { status: 400 });
    }
    const teamMemberId = clean(body.teamMemberId || body.team_member_id) || null;
    const { data, error } = await supabaseAdmin
      .from("reserve_staff_profiles")
      .insert({
        location_id: canonicalLocationId,
        team_member_id: teamMemberId,
        display_name: displayName,
        role,
        can_quick_switch: body.canQuickSwitch !== false,
      })
      .select("id,location_id,team_member_id,display_name,role,pin_length,is_active,can_quick_switch")
      .single();
    if (error) return NextResponse.json({ success: false, error: "Unable to create staff profile." }, { status: 500 });
    if (clean(body.pin)) {
      const setPin = await supabaseAdmin.rpc("reserve_set_staff_pin", { p_staff_profile_id: data.id, p_pin: clean(body.pin) });
      if (setPin.error) {
        await supabaseAdmin.from("reserve_staff_profiles").delete().eq("id", data.id);
        return NextResponse.json({ success: false, error: String(setPin.error.message || "Unable to set staff PIN.") }, { status: 400 });
      }
    }
    return NextResponse.json({ success: true, profile: data });
  }

  if (action === "set_pin") {
    const staffProfileId = clean(body.staffProfileId || body.staff_profile_id);
    const pin = clean(body.pin);
    const profile = await supabaseAdmin
      .from("reserve_staff_profiles")
      .select("id")
      .eq("id", staffProfileId)
      .eq("location_id", canonicalLocationId)
      .maybeSingle();
    if (!profile.data) return NextResponse.json({ success: false, error: "Staff profile not found." }, { status: 404 });
    const result = await supabaseAdmin.rpc("reserve_set_staff_pin", { p_staff_profile_id: staffProfileId, p_pin: pin });
    if (result.error) return NextResponse.json({ success: false, error: String(result.error.message || "Unable to set staff PIN.") }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: "Unsupported staff action." }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const locationId = clean(body.locationId || body.location_id);
  const staffProfileId = clean(body.staffProfileId || body.staff_profile_id);
  if (!locationId || !staffProfileId) return NextResponse.json({ success: false, error: "Missing staff profile." }, { status: 400 });
  const auth = await requireReservePermission(locationId, "manageTeam");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.displayName !== undefined) updates.display_name = clean(body.displayName);
  if (body.role !== undefined && STAFF_ROLES.has(clean(body.role))) updates.role = clean(body.role);
  if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);
  if (body.canQuickSwitch !== undefined) updates.can_quick_switch = Boolean(body.canQuickSwitch);
  const { data, error } = await supabaseAdmin
    .from("reserve_staff_profiles")
    .update(updates)
    .eq("id", staffProfileId)
    .eq("location_id", canonicalLocationId)
    .select("id,display_name,role,pin_length,is_active,can_quick_switch")
    .single();
  if (error) return NextResponse.json({ success: false, error: "Unable to update staff profile." }, { status: 500 });
  return NextResponse.json({ success: true, profile: data });
}
