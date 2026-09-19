import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiRead, requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";
import { getReserveCanonicalLocationId, requireReservePermission } from "@/lib/reserve/locationPermissions";
import { normalizeReservationFormDateTime } from "@/lib/reservations/timeSlots";
import { chargeReservationGuarantee, releaseReservationGuarantee } from "@/lib/reservations/guarantee";

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

const RESERVATION_VIEW_FIELDS = "id,location_id,location_type,bookable_item_id,bookable_item_name,bookable_item_type,customer_name,customer_email,customer_phone,reservation_date,reservation_time,party_size,status,special_request,source,created_at,updated_at,customer_confirmed_at,customer_cancelled_at,arrived_at,seated_at,duration_minutes,turn_time_minutes,guest_notes,vip_tag,special_requests,confirmation_code,locked_until,checked_in_at,completed_at,cancelled_at,waitlist_position,deposit_required,deposit_amount,deposit_status,deposit_paid_at,refund_status,deposit_platform_fee_cents,deposit_refunded_at,converted_experience_id,converted_to_experience_at,experience_booking_id,booking_kind,occasion,prix_fixe_interest,group_booking_notes,guarantee_required,guarantee_status,guarantee_cancel_cutoff_hours,guarantee_late_cancel_fee_type,guarantee_late_cancel_fee_cents,guarantee_no_show_fee_type,guarantee_no_show_fee_cents,guarantee_authorized_at,guarantee_released_at,guarantee_charged_at,large_group_payment_mode,no_show_grace_minutes" as const;
const RESERVATION_GUARANTEE_FIELDS = `${RESERVATION_VIEW_FIELDS},stripe_payment_method_id` as const;

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

function normalizeType(value: string, fallback = "") {
  const type = value.toLowerCase().trim();
  if (!type) return fallback;
  if (["restaurant", "restaurants"].includes(type)) return "restaurant";
  if (["activity", "activities"].includes(type)) return "activity";
  if (["bar", "bars"].includes(type)) return "bar";
  if (["lounge", "lounges"].includes(type)) return "lounge";
  if (["venue", "venues"].includes(type)) return "venue";
  if (["location", "locations"].includes(type)) return "location";
  return type || fallback;
}

function shouldFilterByLocationType(rawType: string) {
  const normalized = normalizeType(rawType);
  if (!normalized) return false;
  if (normalized === "location") return false;
  return true;
}

function normalizeStatus(value: string) {
  const status = value.toLowerCase().trim();
  return allowedStatuses.includes(status) ? status : "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

const RESERVE_TIME_ZONE = "America/New_York";

function dateKey(value: Date, timeZone = RESERVE_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function localClockMillis(value = new Date(), timeZone = RESERVE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
}

function reservationClockMillis(reservation: any) {
  const date = String(reservation.reservation_date || "");
  const time = String(reservation.reservation_time || "00:00");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return Date.UTC(year, month - 1, day, hour, minute, 0);
}

function minutesUntilNoShowEligible(reservation: any) {
  const scheduled = reservationClockMillis(reservation);
  if (scheduled === null) return 0;
  const graceMinutes = Math.max(0, Math.min(180, Number(reservation.no_show_grace_minutes ?? 15)));
  return Math.max(0, Math.ceil((scheduled + graceMinutes * 60_000 - localClockMillis()) / 60_000));
}

function sanitizeReservationForAudit(reservation: any) {
  if (!reservation) return reservation;
  const { stripe_payment_method_id: _paymentMethod, ...safe } = reservation;
  return safe;
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
    let locationId = adminLocationId || cleanString(searchParams.get("locationId"));
    const rawType = cleanString(searchParams.get("type"));
    const locationType = normalizeType(rawType);
    const status = normalizeStatus(cleanString(searchParams.get("status")));
    const filter = cleanString(searchParams.get("filter")).toLowerCase();
    const requestedDate = cleanString(searchParams.get("date"));
    const today = dateKey(new Date());

    if (process.env.NODE_ENV !== "production") console.log("Reserve GET filters", { locationId, rawType, locationType, filter, status });

    let query = supabaseAdmin.from("location_reservations").select(RESERVATION_VIEW_FIELDS).order("reservation_date", { ascending: filter === "upcoming" }).order("reservation_time", { ascending: filter === "upcoming" }).limit(200);

    if (locationId) {
      if (!adminLocationId) {
        const permission = await requireReservePermission(locationId, "viewDashboard");
        if (permission.error) return permission.error;
        locationId = getReserveCanonicalLocationId(permission.access, locationId);
      }
      query = query.eq("location_id", locationId);
      if (shouldFilterByLocationType(rawType)) query = query.eq("location_type", locationType);
    } else if (!adminLocationId) {
      return NextResponse.json({ error: "Missing location ID." }, { status: 400 });
    }

    if (status) query = query.eq("status", status);
    if (filter === "date" && requestedDate) query = query.eq("reservation_date", requestedDate);
    else if (filter === "today") query = query.eq("reservation_date", today);
    else if (filter === "upcoming") query = query.gte("reservation_date", today);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let reservations = data || [];
    const ids = reservations.map((reservation: any) => reservation.id).filter(Boolean);
    if (ids.length) {
      const [sms, conversationResult] = await Promise.all([
        supabaseAdmin.from("sms_logs").select("reservation_id,sent_at,created_at,status").in("reservation_id", ids).eq("message_type", "item_ready").order("created_at", { ascending: false }),
        supabaseAdmin.from("crm_conversations").select("reservation_id,is_unread,unread_count,last_inbound_at,last_message_at,status").eq("location_id", locationId).in("reservation_id", ids).is("archived_at", null),
      ]);
      const readyByReservation = new Map<string, any>();
      if (!sms.error) for (const log of sms.data || []) if (log.reservation_id && !readyByReservation.has(log.reservation_id)) readyByReservation.set(log.reservation_id, log);
      const conversationByReservation = new Map<string, any>();
      if (!conversationResult.error) for (const conversation of conversationResult.data || []) if (conversation.reservation_id && !conversationByReservation.has(conversation.reservation_id)) conversationByReservation.set(conversation.reservation_id, conversation);
      reservations = reservations.map((reservation: any) => {
        const log = readyByReservation.get(reservation.id);
        const conversation = conversationByReservation.get(reservation.id);
        return { ...reservation, ...(log ? { table_ready_sms_sent: true, table_ready_sms_sent_at: log.sent_at || log.created_at, table_ready_sms_status: log.status } : {}), conversation_has_unread: Boolean(conversation?.is_unread), conversation_unread_count: Number(conversation?.unread_count || 0), conversation_last_inbound_at: conversation?.last_inbound_at || null, conversation_last_message_at: conversation?.last_message_at || null, conversation_status: conversation?.status || null };
      });
    }

    if (adminLocationId) await logAdminLocationAction({ adminUser, locationId, actionType: "admin_location_reservations_view", targetType: "location_reservations", metadata: { filter, status, count: reservations.length }, request });
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
    let locationId = adminLocationId || cleanString(body.location_id);
    const locationType = normalizeType(cleanString(body.location_type), "restaurant");
    const status = normalizeStatus(cleanString(body.status));
    if (!locationId) return NextResponse.json({ error: "Missing location ID." }, { status: 400 });

    if (!adminLocationId) {
      const permission = await requireReservePermission(locationId, "manageReservations");
      if (permission.error) return permission.error;
      locationId = getReserveCanonicalLocationId(permission.access, locationId);
    }

    if (!reservationId) {
      const customerName = cleanString(body.customer_name || body.guest_name || body.name);
      const requestedDate = cleanString(body.reservation_date);
      const requestedTime = cleanString(body.reservation_time).slice(0, 5);
      const { reservationDate, reservationTime } = normalizeReservationFormDateTime({ reservationDate: requestedDate, reservationTime: requestedTime });
      const partySize = Math.max(Number(body.party_size || 2), 1);
      if (!customerName || !reservationDate || !reservationTime) return NextResponse.json({ error: "Missing required reservation details." }, { status: 400 });
      const createStatus = status || "confirmed";
      const payload: Record<string, unknown> = { location_id: locationId, location_type: locationType, customer_name: customerName, customer_email: cleanString(body.customer_email) || null, customer_phone: cleanString(body.customer_phone) || null, party_size: partySize, reservation_date: reservationDate, reservation_time: reservationTime, status: createStatus, source: cleanString(body.source) || "owner_dashboard", special_request: cleanString(body.special_request || body.notes) || null, special_requests: cleanString(body.special_request || body.notes) || null, duration_minutes: Number(body.duration_minutes || 90), updated_at: new Date().toISOString() };
      if (createStatus === "checked_in" || createStatus === "arrived") { payload.checked_in_at = new Date().toISOString(); payload.arrived_at = new Date().toISOString(); }
      const { data, error } = await supabaseAdmin.from("location_reservations").insert(payload).select(RESERVATION_VIEW_FIELDS).single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (adminLocationId) await logAdminLocationAction({ adminUser, locationId, actionType: "admin_reservation_create", targetType: "reservation", targetId: data.id, afterData: data, metadata: { locationType }, request });
      return NextResponse.json({ success: true, reservation: data });
    }

    if (!status) return NextResponse.json({ error: "Invalid reservation status." }, { status: 400 });
    const beforeResult = await supabaseAdmin.from("location_reservations").select(RESERVATION_GUARANTEE_FIELDS).eq("id", reservationId).eq("location_id", locationId).maybeSingle();
    if (beforeResult.error) return NextResponse.json({ error: beforeResult.error.message }, { status: 500 });
    if (!beforeResult.data) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    if (status === "no_show") {
      const minutesRemaining = minutesUntilNoShowEligible(beforeResult.data);
      if (minutesRemaining > 0) {
        const grace = Number(beforeResult.data.no_show_grace_minutes ?? 15);
        return NextResponse.json({ error: `This reservation cannot be marked no-show until the ${grace}-minute arrival grace period has passed.`, minutes_remaining: minutesRemaining }, { status: 409 });
      }
    }

    let guaranteeResult: Record<string, unknown> | null = null;
    let guaranteeError: string | null = null;
    if (status === "no_show" && beforeResult.data.guarantee_required && beforeResult.data.guarantee_status === "active") {
      try { guaranteeResult = await chargeReservationGuarantee(beforeResult.data, "no_show"); } catch (error) { guaranteeError = getErrorMessage(error); }
    } else if (["completed", "cancelled", "declined"].includes(status) && beforeResult.data.guarantee_status === "active") {
      await releaseReservationGuarantee(reservationId);
      guaranteeResult = { charged: false, released: true, reason: status };
    }

    const updatePayload: ReservationUpdatePayload = { status, updated_at: new Date().toISOString() };
    if (status === "checked_in" || status === "arrived") { updatePayload.checked_in_at = new Date().toISOString(); updatePayload.arrived_at = new Date().toISOString(); }
    if (status === "completed") updatePayload.completed_at = new Date().toISOString();
    if (status === "cancelled") { updatePayload.customer_cancelled_at = new Date().toISOString(); updatePayload.cancelled_at = new Date().toISOString(); }

    const updateResult = await supabaseAdmin.from("location_reservations").update(updatePayload).eq("id", reservationId).eq("location_id", locationId).select(RESERVATION_VIEW_FIELDS).maybeSingle();
    if (updateResult.error) return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    if (!updateResult.data) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    if (adminLocationId) await logAdminLocationAction({ adminUser, locationId, actionType: "admin_reservation_status_update", targetType: "reservation", targetId: reservationId, beforeData: sanitizeReservationForAudit(beforeResult.data), afterData: updateResult.data, metadata: { status, guaranteeResult: guaranteeResult ? { ...guaranteeResult, paymentIntentId: undefined } : null, guaranteeError }, request });

    return NextResponse.json({ success: true, reservation: updateResult.data, guarantee: guaranteeResult ? { charged: guaranteeResult.charged, amountCents: guaranteeResult.amountCents, released: guaranteeResult.released, reason: guaranteeResult.reason } : null, guarantee_charge_failed: Boolean(guaranteeError), guarantee_error: guaranteeError });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}