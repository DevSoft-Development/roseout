import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";
import { getReserveStaffSession } from "@/lib/reserve/staffSession";
import { rankStaffForParty } from "@/lib/reservations/enterpriseHost";
import {
  assignReserveResourceViaAws,
  assignReserveServerViaAws,
  reserveApiConfigured,
} from "@/lib/aws/reserve-api";

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

async function verifyManagerApproval(locationId: string, body: Record<string, any>) {
  const managerStaffProfileId = clean(body.managerStaffProfileId || body.manager_staff_profile_id);
  const managerPin = clean(body.managerPin || body.manager_pin);
  if (!managerStaffProfileId || !/^\d{4,6}$/.test(managerPin)) {
    return { error: "Manager approval requires a 4–6 digit manager PIN." } as const;
  }

  const manager = await supabaseAdmin
    .from("reserve_staff_profiles")
    .select("id,display_name,role,is_active,can_quick_switch")
    .eq("id", managerStaffProfileId)
    .eq("location_id", locationId)
    .maybeSingle();

  if (
    manager.error ||
    !manager.data ||
    manager.data.is_active === false ||
    !["manager"].includes(String(manager.data.role || ""))
  ) {
    return { error: "Choose an active Reserve manager for this approval." } as const;
  }

  const verify = await supabaseAdmin.rpc("reserve_verify_staff_pin", {
    p_staff_profile_id: managerStaffProfileId,
    p_pin: managerPin,
  });
  if (verify.error || verify.data !== true) {
    return { error: "Manager PIN was not accepted." } as const;
  }

  return { manager: manager.data } as const;
}

async function assignResource(input: {
  reservationId: string;
  locationId: string;
  resource: { id: string | null; label: string; type: string; capacity: number | null; bar: boolean };
  seatAfterAssign: boolean;
  actorStaffProfileId: string | null;
  overrideReason: string | null;
}) {
  if (reserveApiConfigured()) {
    try {
      const result = await assignReserveResourceViaAws({
        reservationId: input.reservationId,
        locationId: input.locationId,
        resourceId: input.resource.id,
        resourceLabel: input.resource.label,
        resourceType: input.resource.type,
        resourceCapacity: input.resource.bar ? null : input.resource.capacity,
        seatAfterAssign: input.seatAfterAssign,
        staffProfileId: input.actorStaffProfileId,
        overrideReason: input.overrideReason,
      });
      return { data: result.reservation as any, error: null, service: "aws-reserve-api" as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reserve API unavailable";
      if (/assigned|conflict|fit|available|not found/i.test(message)) {
        return { data: null, error: { message }, service: "aws-reserve-api" as const };
      }
      console.error("Reserve API seating failed; using database fallback", { error: message });
    }
  }

  const rpc = await supabaseAdmin.rpc("reserve_assign_resource_atomic", {
    p_reservation_id: input.reservationId,
    p_location_id: input.locationId,
    p_resource_id: input.resource.id,
    p_resource_label: input.resource.label,
    p_resource_type: input.resource.type,
    p_resource_capacity: input.resource.bar ? null : input.resource.capacity,
    p_seat_after_assign: input.seatAfterAssign,
    p_staff_profile_id: input.actorStaffProfileId,
    p_override_reason: input.overrideReason,
  });
  return { data: rpc.data as any, error: rpc.error, service: "supabase-direct" as const };
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
  const operatingStaffProfileId = staffSession?.staff_profile_id || null;

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
  let approvingManager: any = null;
  if (overrideReason) {
    const approval = await verifyManagerApproval(canonicalLocationId, body);
    if ("error" in approval) {
      return NextResponse.json({ success: false, code: "manager_approval_required", error: approval.error }, { status: 403 });
    }
    approvingManager = approval.manager;
  }

  const actorStaffProfileId = approvingManager?.id || operatingStaffProfileId;
  const assignment = await assignResource({
    reservationId,
    locationId: canonicalLocationId,
    resource,
    seatAfterAssign: body.seat_after_assign !== false,
    actorStaffProfileId,
    overrideReason,
  });

  if (assignment.error) {
    const message = String(assignment.error.message || "Unable to seat this guest.");
    const conflict = /assigned|conflict|fit|available/i.test(message);
    return NextResponse.json(
      { success: false, code: conflict ? "seat_conflict" : "seat_failed", error: message },
      { status: conflict ? 409 : 500 },
    );
  }

  if (approvingManager) {
    await supabaseAdmin.from("reserve_service_events").insert({
      location_id: canonicalLocationId,
      reservation_id: reservationId,
      staff_profile_id: approvingManager.id,
      event_type: "manager.pin_approval",
      resource_label: resource.label,
      metadata: {
        reason: overrideReason,
        operating_staff_profile_id: operatingStaffProfileId,
        approving_manager_name: approvingManager.display_name,
      },
    });
  }

  let reservation = assignment.data;
  let recommendedServer: any = null;
  let serverAssignmentService: "aws-reserve-api" | "supabase-direct" | null = null;
  const settings = await supabaseAdmin
    .from("reserve_service_settings")
    .select("assignment_mode")
    .eq("location_id", canonicalLocationId)
    .maybeSingle();
  const assignmentMode = settings.data?.assignment_mode || "balanced";
  if (assignmentMode !== "manual" && !reservation?.server_staff_profile_id) {
    const serviceDate = reservation?.reservation_date || reservationResult.data.reservation_date;
    const staff = await activeStaff(canonicalLocationId, serviceDate);
    const dayReservations = await supabaseAdmin
      .from("location_reservations")
      .select("id,status,reservation_date,reservation_time,party_size,seated_at,server_staff_profile_id")
      .eq("location_id", canonicalLocationId)
      .eq("reservation_date", serviceDate);
    const ranking = rankStaffForParty(
      Number(reservation?.party_size || reservationResult.data.party_size || 1),
      staff,
      dayReservations.data || [],
    );
    recommendedServer = ranking[0] || null;
    if (assignmentMode === "balanced" && recommendedServer?.staff?.id) {
      if (reserveApiConfigured()) {
        try {
          const serverResult = await assignReserveServerViaAws({
            reservationId,
            locationId: canonicalLocationId,
            serverStaffProfileId: recommendedServer.staff.id,
            actorStaffProfileId,
          });
          reservation = serverResult.reservation as any;
          serverAssignmentService = "aws-reserve-api";
        } catch (error) {
          console.error("Reserve API server assignment failed; using database fallback", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (!serverAssignmentService) {
        const serverRpc = await supabaseAdmin.rpc("reserve_assign_server", {
          p_reservation_id: reservationId,
          p_location_id: canonicalLocationId,
          p_server_staff_profile_id: recommendedServer.staff.id,
          p_actor_staff_profile_id: actorStaffProfileId,
        });
        if (!serverRpc.error) {
          reservation = serverRpc.data;
          serverAssignmentService = "supabase-direct";
        }
      }
      if (serverAssignmentService) {
        await supabaseAdmin.from("reserve_background_outbox").insert({
          location_id: canonicalLocationId,
          reservation_id: reservationId,
          event_type: "server.auto_assigned",
          payload: { server_staff_profile_id: recommendedServer.staff.id },
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    lane: "reserve-v1",
    service: assignment.service,
    reservation,
    resource,
    assignmentMode,
    recommendedServer,
    serverAssignmentService,
    managerApproval: approvingManager ? {
      staffProfileId: approvingManager.id,
      displayName: approvingManager.display_name,
    } : null,
  }, {
    headers: { "Cache-Control": "no-store", "X-TheOutHaven-API-Lane": "reserve-v1" },
  });
}