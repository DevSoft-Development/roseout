import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiRead, requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";
import { requireReservePermission } from "@/lib/reserve/locationPermissions";
import { normalizeReservationFormDateTime } from "@/lib/reservations/timeSlots";

const allowedStatuses = [
  "pending",
  "confirmed",
  "checked_in",
  "waiting",
  "arrived",
  "seated",
  "waitlisted",
  "declined",
  "cancelled",
  "completed",
  "no_show",
];

type ReservationUpdatePayload = {
  status: string;
  updated_at: string;
  arrived_at?: string;
  checked_in_at?: string;
  completed_at?: string;
  customer_cancelled_at?: string;
  cancelled_at?: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeType(value: string) {
  const type = value.toLowerCase().trim();

  if (["activity", "activities"].includes(type)) return "activity";
  if (["bar", "bars"].includes(type)) return "bar";
  if (["lounge", "lounges"].includes(type)) return "lounge";
  if (["venue", "venues"].includes(type)) return "venue";

  return "restaurant";
}

function normalizeStatus(value: string) {
  const status = value.toLowerCase().trim();
  return allowedStatuses.includes(status) ? status : "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function dateKey(value: Date) {
  return value.toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminLocationId = cleanString(searchParams.get("adminLocationId"));
    let adminUser: any = null;
    if (adminLocationId) {
      const auth = await requireAdminLocationApiRead();
      if (auth.error) return auth.error;
      adminUser = auth.adminUser;
    }
    const locationId = adminLocationId || cleanString(searchParams.get("locationId"));
    const locationType = normalizeType(cleanString(searchParams.get("type")));
    const status = normalizeStatus(cleanString(searchParams.get("status")));
    const filter = cleanString(searchParams.get("filter")).toLowerCase();
    const today = dateKey(new Date());

    let query = supabaseAdmin
      .from("location_reservations")
      .select("*")
      .order("reservation_date", { ascending: filter === "upcoming" })
      .order("reservation_time", { ascending: filter === "upcoming" })
      .limit(200);

    if (locationId) {
      if (!adminLocationId) {
        const permission = await requireReservePermission(locationId, "viewDashboard");
        if (permission.error) return permission.error;
      }
      query = query.eq("location_id", locationId).eq("location_type", locationType);
    } else if (!adminLocationId) {
      return NextResponse.json({ error: "Missing location ID." }, { status: 400 });
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (filter === "today") {
      query = query.eq("reservation_date", today);
    }

    if (filter === "upcoming") {
      query = query.gte("reservation_date", today);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }



    let reservations = data || [];
    const ids = reservations.map((reservation: any) => reservation.id).filter(Boolean);
    if (ids.length) {
      const sms = await supabaseAdmin
        .from("sms_logs")
        .select("reservation_id,sent_at,created_at,status")
        .in("reservation_id", ids)
        .eq("message_type", "item_ready")
        .order("created_at", { ascending: false });
      if (!sms.error) {
        const byReservation = new Map<string, any>();
        for (const log of sms.data || []) {
          if (log.reservation_id && !byReservation.has(log.reservation_id)) byReservation.set(log.reservation_id, log);
        }
        reservations = reservations.map((reservation: any) => {
          const log = byReservation.get(reservation.id);
          return log ? { ...reservation, table_ready_sms_sent: true, table_ready_sms_sent_at: log.sent_at || log.created_at, table_ready_sms_status: log.status } : reservation;
        });
      }
    }

    if (adminLocationId) {
      await logAdminLocationAction({
        adminUser,
        locationId,
        actionType: "admin_location_reservations_view",
        targetType: "location_reservations",
        metadata: { filter, status, count: reservations.length },
        request,
      });
    }

    return NextResponse.json({ reservations });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const reservationId = cleanString(body.reservation_id);
    const adminLocationId = cleanString(body.adminLocationId || body.admin_location_id);
    let adminUser: any = null;
    if (adminLocationId) {
      const auth = await requireAdminLocationApiWrite();
      if (auth.error) return auth.error;
      adminUser = auth.adminUser;
    }
    const locationId = adminLocationId || cleanString(body.location_id);
    const locationType = normalizeType(
      cleanString(body.location_type) || "restaurant"
    );
    const status = normalizeStatus(cleanString(body.status));

    if (!reservationId) {
      const customerName = cleanString(body.customer_name || body.guest_name || body.name);
      const requestedDate = cleanString(body.reservation_date);
      const requestedTime = cleanString(body.reservation_time).slice(0, 5);
      const { reservationDate, reservationTime } = normalizeReservationFormDateTime({ reservationDate: requestedDate, reservationTime: requestedTime });
      const partySize = Math.max(Number(body.party_size || 2), 1);
      if (!locationId || !customerName || !reservationDate || !reservationTime) {
        return NextResponse.json({ error: "Missing required reservation details." }, { status: 400 });
      }
      const createStatus = status || "confirmed";
      const payload: Record<string, unknown> = {
        location_id: locationId,
        location_type: locationType,
        customer_name: customerName,
        customer_email: cleanString(body.customer_email) || null,
        customer_phone: cleanString(body.customer_phone) || null,
        party_size: partySize,
        reservation_date: reservationDate,
        reservation_time: reservationTime,
        status: createStatus,
        source: cleanString(body.source) || "owner_dashboard",
        special_request: cleanString(body.special_request || body.notes) || null,
        special_requests: cleanString(body.special_request || body.notes) || null,
        duration_minutes: Number(body.duration_minutes || 90),
        updated_at: new Date().toISOString(),
      };
      if (createStatus === "checked_in" || createStatus === "arrived") {
        payload.checked_in_at = new Date().toISOString();
        payload.arrived_at = new Date().toISOString();
      }
      const { data, error } = await supabaseAdmin.from("location_reservations").insert(payload).select("*").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (adminLocationId) {
        await logAdminLocationAction({ adminUser, locationId, actionType: "admin_reservation_create", targetType: "reservation", targetId: data.id, afterData: data, metadata: { locationType }, request });
      }
      return NextResponse.json({ success: true, reservation: data });
    }

    if (!locationId) {
      return NextResponse.json(
        { error: "Missing location ID." },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { error: "Invalid reservation status." },
        { status: 400 }
      );
    }

    const beforeResult = adminLocationId
      ? await supabaseAdmin.from("location_reservations").select("*").eq("id", reservationId).eq("location_id", locationId).maybeSingle()
      : null;

    const updatePayload: ReservationUpdatePayload = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "checked_in" || status === "arrived") {
      updatePayload.arrived_at = new Date().toISOString();
      updatePayload.checked_in_at = new Date().toISOString();
    }

    if (status === "completed") {
      updatePayload.completed_at = new Date().toISOString();
    }

    if (status === "cancelled") {
      updatePayload.customer_cancelled_at = new Date().toISOString();
      updatePayload.cancelled_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from("location_reservations")
      .update(updatePayload)
      .eq("id", reservationId)
      .eq("location_id", locationId)
      .eq("location_type", locationType)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data?.user_id && ["confirmed", "completed", "checked_in", "arrived"].includes(status)) {
      await supabaseAdmin.from("user_outings").upsert({
        user_id: data.user_id,
        reservation_id: data.id,
        source: "internal_reservation",
        status: status === "completed" ? "completed" : "reservation_confirmed",
        title: data.location_name || data.restaurant_name || "TheOutHaven Reservation",
        outing_date: data.reservation_date && data.reservation_time ? `${data.reservation_date}T${data.reservation_time}` : null,
        party_size: data.party_size || null,
        restaurant_id: data.location_type === "restaurant" ? data.location_id : null,
        restaurant_name: data.location_name || data.restaurant_name || null,
        activity_id: data.location_type !== "restaurant" ? data.location_id : null,
        activity_name: data.location_type !== "restaurant" ? data.location_name : null,
        reservation_payload: data,
        booked_at: data.created_at || new Date().toISOString(),
        completed_at: status === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,reservation_id" });
    }

    if (adminLocationId) {
      await logAdminLocationAction({
        adminUser,
        locationId,
        actionType: status === "cancelled" ? "admin_reservation_cancel" : `admin_reservation_${status}`,
        targetType: "reservation",
        targetId: reservationId,
        beforeData: beforeResult?.data || null,
        afterData: data,
        metadata: { locationType },
        request,
      });
    }

    return NextResponse.json({
      success: true,
      reservation: data,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
