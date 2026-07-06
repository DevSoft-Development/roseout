import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";
import { canTransitionReservationStatus } from "@/lib/reservations/ui";
import { requireReservePermission } from "@/lib/reserve/locationPermissions";

const allowedStatuses = [
  "pending",
  "confirmed",
  "arrived",
  "checked_in",
  "waiting",
  "seated",
  "waitlisted",
  "declined",
  "cancelled",
  "completed",
  "no_show",
];

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeType(value: string) {
  const type = value.toLowerCase().trim();
  if (["activity", "activities"].includes(type)) return "activity";
  if (["bar", "bars"].includes(type)) return "bar";
  if (["lounge", "lounges"].includes(type)) return "lounge";
  if (["venue", "venues"].includes(type)) return "venue";
  return type;
}

function normalizeStatus(value: string) {
  const status = value.toLowerCase().trim();
  return allowedStatuses.includes(status) ? status : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const reservationId = cleanString(body.reservation_id);
    const adminLocationId = cleanString(body.adminLocationId || body.admin_location_id);
    if (adminLocationId) {
      const auth = await requireAdminLocationApiWrite();
      if (auth.error) return auth.error;
      body.__adminUser = auth.adminUser;
    }

    const requestedLocationId = cleanString(body.location_id);
    let locationId = adminLocationId || requestedLocationId;
    const requestedLocationType = normalizeType(cleanString(body.location_type));
    const status = normalizeStatus(cleanString(body.status));
    const requestedDate = cleanString(body.reservation_date);
    const requestedTime = cleanString(body.reservation_time);
    const requestedDuration = Number(body.duration_minutes);
    const requestedNote = cleanString(body.special_request || body.notes || body.reason);
    const hasCustomerPhone = Object.prototype.hasOwnProperty.call(body, "customer_phone");
    const hasCustomerEmail = Object.prototype.hasOwnProperty.call(body, "customer_email");
    const requestedCustomerPhone = cleanString(body.customer_phone);
    const requestedCustomerEmail = cleanString(body.customer_email);
    const isContactUpdateRequest = hasCustomerPhone || hasCustomerEmail;
    const isMoveTimeRequest = Boolean(requestedDate || requestedTime || Number.isFinite(requestedDuration) || requestedNote);

    if (!reservationId) {
      return NextResponse.json(
        { error: "Missing reservation ID." },
        { status: 400 }
      );
    }

    if (!locationId) {
      return NextResponse.json({ error: "Missing location ID." }, { status: 400 });
    }

    if (!adminLocationId) {
      const permission = await requireReservePermission(locationId, "manageReservations");
      if (permission.error) return permission.error;
      locationId = String(permission.access.location?.id || locationId);
    }

    if (!status && !isMoveTimeRequest && !isContactUpdateRequest) {
      return NextResponse.json(
        { error: "Invalid reservation status." },
        { status: 400 }
      );
    }

    const beforeResult = await supabaseAdmin.from("location_reservations").select("*").eq("id", reservationId).eq("location_id", locationId).maybeSingle();

    if (!beforeResult.data) {
      return NextResponse.json({ error: "We could not find that reservation for this location." }, { status: 404 });
    }

    if (status && !canTransitionReservationStatus(beforeResult.data.status, status)) {
      return NextResponse.json(
        { error: "That reservation can’t move to the requested status from its current state." },
        { status: 400 }
      );
    }
    if (isContactUpdateRequest) {
      const nextPhone = hasCustomerPhone ? requestedCustomerPhone : cleanString(beforeResult.data.customer_phone);
      const nextEmail = hasCustomerEmail ? requestedCustomerEmail : cleanString(beforeResult.data.customer_email);
      if (!nextPhone && !nextEmail) {
        return NextResponse.json({ error: "Please keep at least one email or phone number on this reservation." }, { status: 400 });
      }
    }

    if (isMoveTimeRequest && ["completed", "cancelled", "declined", "no_show"].includes(String(beforeResult.data.status || ""))) {
      return NextResponse.json({ error: "Completed, cancelled, or no-show reservations cannot be moved." }, { status: 400 });
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (status) updatePayload.status = status;
    if (requestedDate) updatePayload.reservation_date = requestedDate;
    if (requestedTime) updatePayload.reservation_time = requestedTime;
    if (Number.isFinite(requestedDuration) && requestedDuration > 0) updatePayload.duration_minutes = requestedDuration;
    if (requestedNote || Object.prototype.hasOwnProperty.call(body, "special_request") || Object.prototype.hasOwnProperty.call(body, "notes")) updatePayload.special_request = requestedNote || null;
    if (hasCustomerPhone) updatePayload.customer_phone = requestedCustomerPhone || null;
    if (hasCustomerEmail) updatePayload.customer_email = requestedCustomerEmail || null;

    const now = new Date().toISOString();
    if (status === "arrived" || status === "checked_in" || status === "waiting") {
      updatePayload.arrived_at = now;
      updatePayload.checked_in_at = now;
    }
    if (status === "seated") updatePayload.seated_at = now;
    if (status === "completed") updatePayload.completed_at = now;
    if (status === "cancelled") {
      updatePayload.customer_cancelled_at = now;
      updatePayload.cancelled_at = now;
    }
    if (status === "no_show") updatePayload.no_show_at = now;

    const { data, error } = await supabaseAdmin
      .from("location_reservations")
      .update(updatePayload)
      .eq("id", reservationId)
      .eq("location_id", locationId)
      .select("*")
      .single();

    if (error) {
      console.error("RESERVATION_UPDATE_FAILED", error);
      return NextResponse.json({ error: "Request could not be completed." }, { status: 500 });
    }

    if (adminLocationId) {
      await logAdminLocationAction({
        adminUser: body.__adminUser,
        locationId,
        actionType: status ? (status === "cancelled" ? "admin_reservation_cancel" : `admin_reservation_${status}`) : isContactUpdateRequest ? "admin_reservation_update_guest" : "admin_reservation_move_time",
        targetType: "reservation",
        targetId: reservationId,
        beforeData: beforeResult.data || null,
        afterData: data,
        metadata: { locationType: requestedLocationType || beforeResult.data.location_type, movedTime: isMoveTimeRequest, updatedContact: isContactUpdateRequest },
        request,
      });
    }

    return NextResponse.json({
      success: true,
      reservation: data,
    });
  } catch (error: any) {
    console.error("RESERVATION_UPDATE_UNHANDLED", error);
    return NextResponse.json({ error: "Request could not be completed." }, { status: 500 });
  }
}