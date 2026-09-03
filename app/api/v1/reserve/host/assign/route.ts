import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";
import { getReserveStaffSession } from "@/lib/reserve/staffSession";
import { rankStaffForParty } from "@/lib/reservations/enterpriseHost";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizedType(value: unknown) {
  return clean(value).toLowerCase().replaceAll(" ", "_");
}

function isBarType(value: unknown) {
  return ["bar", "bar_seat", "counter", "counter_seat"].includes(normalizedType(value));
}

async function authoritativeResource(locationId: string, input: Record<string, any>) {
  const rawId = clean(input.resource_id || input.id);
  if (rawId && isUuid(rawId)) {
    const layout = await supabaseAdmin
      .from("layout_items")
      .select("id,item_name,item_type,capacity,is_active")
      .eq("id", rawId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (!layout.error && layout.data && layout.data.is_active !== false) {
      return {
        id: layout.data.id,
        label: clean(layout.data.item_name),
        type: clean(layout.data.item_type) || "table",
        capacity: Number(layout.data.capacity || 0) || null,
        bar: isBarType(layout.data.item_type),
      };
    }

    const bookable = await supabaseAdmin
      .from("location_bookable_items")
      .select("*")
      .eq("id", rawId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (!bookable.error && bookable.data && bookable.data.is_active !== false) {
      return {
        id: bookable.data.id,
        label: clean(bookable.data.item_name || bookable.data.name || bookable.data.label),
        type: clean(bookable.data.item_type || bookable.data.type) || "table",
        capacity: Number(bookable.data.capacity_max ?? bookable.data.capacity ?? 0) || null,
        bar: isBarType(bookable.data.item_type || bookable.data.type),
      };
    }
  }

  const requestedLabel = clean(input.resource_label || input.resource_name || input.item_name);
  const seatMatch = requestedLabel.match(/^(.*)\s+Seat\s+(\d+)$/i);
  if (seatMatch) {
    const parentName = seatMatch[1].trim();
    const seatNumber = Number(seatMatch[2]);
    const parent = await supabaseAdmin
      .from("layout_items")
      .select("id,item_name,item_type,capacity,is_active")
      .eq("location_id", locationId)
      .ilike("item_name", parentName)
      .maybeSingle();
    if (
      !parent.error &&
      parent.data &&
      parent.data.is_active !== false &&
      isBarType(parent.data.item_type) &&
      seatNumber >= 1 &&
      seatNumber <= Number(parent.data.capacity || 0)
    ) {
      return {
        id: null,
        label: `${parent.data.item_name} Seat ${seatNumber}`,
        type: normalizedType(parent.data.item_type).startsWith("counter") ? "counter_seat" : "bar_seat",
        capacity: null,
        bar: true,
      };
    }
  }
  return null;
}

async function activeStaff(locationId: string, date: string) {
  const [profiles, shifts] = await Promise.all([
    supabaseAdmin
      .from("reserve_staff_profiles")
      .select("id,display_name,role,is_active")
      .eq("location_id", locationId)
      .eq("is_active", true),
    supabaseAdmin
      .from("reserve_staff_shifts")
      .select("*")
      .eq("location_id", locationId)
      .eq("service_date", date),
  ]);
  if (profiles.error || shifts.error) return [];
  return (profiles.data || []).map((profile: any) => {
    const shift = (shifts.data || []).find((row: any) => row.staff_profile_id === profile.id);
    return {
      ...profile,
      status: shift?.status || "unavailable",
      section_id: shift?.section_id || null,
      max_tables: shift?.max_tables || null,
      max_covers: shift?.max_covers || null,
    };
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const locationId = clean(body.location_id || body.locationId);
  const reservationId = clean(body.reservation_id || body.reservationId);
  if (!locationId || !reservationId) {
    return NextResponse.json({ success: false, error: "Choose a reservation and table." }, { status: 400 });
  }

  const auth = await requireReservePermission(locationId, "manageReservations");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const staffSession = await getReserveStaffSession(canonicalLocationId);
  const actorStaffProfileId = staffSession?.staff_profile_id || null;

  const reservationResult = await supabaseAdmin
    .from("location_reservations")
    .select("*")
    .eq("id", reservationId)
    .eq("location_id", canonicalLocationId)
    .maybeSingle();
  if (reservationResult.error || !reservationResult.data) {
    return NextResponse.json({ success: false, error: "Reservation not found." }, { status: 404 });
  }

  const resource = await authoritativeResource(canonicalLocationId, body);
  if (!resource?.label) {
    return NextResponse.json({ success: false, error: "That table or seat is no longer available. Refresh the floor." }, { status: 404 });
  }

  const overrideReason = clean(body.override_reason) || null;
  if (overrideReason && !["location_admin", "manager"].includes(String(auth.access?.role || ""))) {
    return NextResponse.json({ success: false, error: "A manager is required for this override." }, { status: 403 });
  }

  const rpc = await supabaseAdmin.rpc("reserve_assign_resource_atomic", {
    p_reservation_id: reservationId,
    p_location_id: canonicalLocationId,
    p_resource_id: resource.id,
    p_resource_label: resource.label,
    p_resource_type: resource.type,
    p_resource_capacity: resource.bar ? null : resource.capacity,
    p_seat_after_assign: body.seat_after_assign !== false,
    p_staff_profile_id: actorStaffProfileId,
    p_override_reason: overrideReason,
  });

  if (rpc.error) {
    const message = String(rpc.error.message || "Unable to seat this guest.");
    const conflict = /assigned|conflict|fit|available/i.test(message);
    return NextResponse.json(
      { success: false, code: conflict ? "seat_conflict" : "seat_failed", error: message },
      { status: conflict ? 409 : 500 },
    );
  }

  let reservation = rpc.data;
  let recommendedServer: any = null;
  const settings = await supabaseAdmin
    .from("reserve_service_settings")
    .select("assignment_mode")
    .eq("location_id", canonicalLocationId)
    .maybeSingle();
  const assignmentMode = settings.data?.assignment_mode || "balanced";
  if (assignmentMode !== "manual" && !reservation?.server_staff_profile_id) {
    const staff = await activeStaff(canonicalLocationId, reservation.reservation_date);
    const dayReservations = await supabaseAdmin
      .from("location_reservations")
      .select("id,status,reservation_date,reservation_time,party_size,seated_at,server_staff_profile_id")
      .eq("location_id", canonicalLocationId)
      .eq("reservation_date", reservation.reservation_date);
    const ranking = rankStaffForParty(Number(reservation.party_size || 1), staff, dayReservations.data || []);
    recommendedServer = ranking[0] || null;
    if (assignmentMode === "balanced" && recommendedServer?.staff?.id) {
      const serverRpc = await supabaseAdmin.rpc("reserve_assign_server", {
        p_reservation_id: reservationId,
        p_location_id: canonicalLocationId,
        p_server_staff_profile_id: recommendedServer.staff.id,
        p_actor_staff_profile_id: actorStaffProfileId,
      });
      if (!serverRpc.error) reservation = serverRpc.data;
    }
  }

  return NextResponse.json({
    success: true,
    lane: "reserve-v1",
    reservation,
    resource,
    assignmentMode,
    recommendedServer,
  }, {
    headers: { "Cache-Control": "no-store", "X-TheOutHaven-API-Lane": "reserve-v1" },
  });
}