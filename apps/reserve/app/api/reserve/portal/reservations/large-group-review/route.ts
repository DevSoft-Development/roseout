import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { requireReservePermission } from "@/lib/reserve/locationPermissions";
import { getLocationName } from "@/lib/locationName";
import { sendReservationConfirmationEmail } from "@/lib/email/reservation-emails";
import { sendReservationConfirmationSMS } from "@/lib/sms/reservation-sms";

const REVIEW_MARKER = "[Large group review: more information needed]";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function minutes(value: unknown) {
  const [h, m] = clean(value).slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
}

function assignedLabels(value: unknown) {
  return clean(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

async function assignLargeGroupTables(reservation: any, locationId: string) {
  if (clean(reservation.bookable_item_name)) return reservation;

  const { data: resources, error: resourceError } = await supabaseAdmin
    .from("layout_items")
    .select("id,item_name,item_type,capacity,status,is_active")
    .eq("location_id", locationId)
    .eq("is_active", true);

  if (resourceError) throw resourceError;
  const usable = (resources || []).filter((resource: any) => {
    const status = clean(resource.status).toLowerCase();
    return !["blocked", "closed", "maintenance"].includes(status) && Number(resource.capacity || 0) > 0;
  });

  if (!usable.length) return reservation;

  const { data: conflicts, error: conflictError } = await supabaseAdmin
    .from("location_reservations")
    .select("id,reservation_time,duration_minutes,bookable_item_name,status")
    .eq("location_id", locationId)
    .eq("reservation_date", reservation.reservation_date)
    .neq("id", reservation.id)
    .not("status", "in", '("cancelled","declined","completed","no_show")');

  if (conflictError) throw conflictError;

  const start = minutes(reservation.reservation_time);
  const end = start + Number(reservation.duration_minutes || 180);
  const occupied = new Set<string>();

  for (const conflict of conflicts || []) {
    const otherStart = minutes(conflict.reservation_time);
    const otherEnd = otherStart + Number(conflict.duration_minutes || 90);
    if (start < otherEnd && otherStart < end) {
      for (const label of assignedLabels(conflict.bookable_item_name)) occupied.add(label);
    }
  }

  const available = usable.filter((resource: any) => !occupied.has(clean(resource.item_name).toLowerCase()));
  const normal = available
    .filter((resource: any) => !["bar", "bar_seat", "counter", "counter_seat"].includes(clean(resource.item_type).toLowerCase()))
    .sort((a: any, b: any) => Number(b.capacity || 0) - Number(a.capacity || 0));
  const overflow = available
    .filter((resource: any) => ["bar", "bar_seat", "counter", "counter_seat"].includes(clean(resource.item_type).toLowerCase()))
    .sort((a: any, b: any) => Number(b.capacity || 0) - Number(a.capacity || 0));

  const selected: any[] = [];
  let seats = 0;
  for (const resource of [...normal, ...overflow]) {
    selected.push(resource);
    seats += Number(resource.capacity || 0);
    if (seats >= Number(reservation.party_size || 0)) break;
  }

  if (!selected.length || seats < Number(reservation.party_size || 0)) return reservation;

  const names = selected.map((resource) => clean(resource.item_name)).filter(Boolean);
  const { data: updated, error } = await supabaseAdmin
    .from("location_reservations")
    .update({
      bookable_item_id: selected.length === 1 ? selected[0].id : null,
      bookable_item_name: names.join(", "),
      bookable_item_type: selected.length === 1 ? clean(selected[0].item_type) || "table" : "group_tables",
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservation.id)
    .eq("location_id", locationId)
    .select("*")
    .single();

  if (error) throw error;
  return updated;
}

async function sendConfirmation(reservation: any, locationId: string) {
  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,business_name")
    .eq("id", locationId)
    .maybeSingle();

  const locationName = getLocationName(location || {}, "TheOutHaven location");
  const confirmationCode = reservation.confirmation_code || reservation.customer_token || reservation.id;
  const results = await Promise.allSettled([
    sendReservationConfirmationEmail({
      to: reservation.customer_email,
      locationName,
      reservationDate: reservation.reservation_date,
      reservationTime: reservation.reservation_time,
      partySize: reservation.party_size,
      confirmationCode,
      customerName: reservation.customer_name,
    }),
    sendReservationConfirmationSMS({
      to: reservation.customer_phone,
      locationName,
      reservationDate: reservation.reservation_date,
      reservationTime: reservation.reservation_time,
    }),
  ]);

  return {
    email: results[0].status === "fulfilled" ? "sent" : "failed",
    sms: results[1].status === "fulfilled" ? "sent" : "failed",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const reservationId = clean(body.reservation_id);
    const requestedLocationId = clean(body.location_id);
    const adminLocationId = clean(body.adminLocationId || body.admin_location_id);
    const action = clean(body.action).toLowerCase();

    if (!reservationId || !requestedLocationId || !["approve", "reject", "more_info", "assign_tables"].includes(action)) {
      return NextResponse.json({ error: "Invalid large group review request." }, { status: 400 });
    }

    let locationId = adminLocationId || requestedLocationId;
    if (adminLocationId) {
      const auth = await requireAdminLocationApiWrite();
      if (auth.error) return auth.error;
    } else {
      const permission = await requireReservePermission(locationId, "manageReservations");
      if (permission.error) return permission.error;
      locationId = String(permission.access.location?.id || locationId);
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("location_reservations")
      .select("*")
      .eq("id", reservationId)
      .eq("location_id", locationId)
      .eq("booking_kind", "large_group")
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) return NextResponse.json({ error: "Large group booking not found." }, { status: 404 });

    if (action === "assign_tables") {
      if (String(existing.status || "").toLowerCase() !== "confirmed") {
        return NextResponse.json({ error: "Large group seating can only be assigned after approval." }, { status: 409 });
      }
      const reservation = await assignLargeGroupTables(existing, locationId);
      return NextResponse.json({ success: true, reservation });
    }

    if (action === "more_info") {
      const baseNotes = clean(existing.special_request)
        .split("\n")
        .filter((line) => line.trim() !== REVIEW_MARKER)
        .join("\n")
        .trim();
      const notes = [baseNotes, REVIEW_MARKER].filter(Boolean).join("\n");
      const { data, error } = await supabaseAdmin
        .from("location_reservations")
        .update({ special_request: notes, special_requests: notes, updated_at: new Date().toISOString() })
        .eq("id", reservationId)
        .eq("location_id", locationId)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, reservation: data });
    }

    if (action === "reject") {
      const { data, error } = await supabaseAdmin
        .from("location_reservations")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("id", reservationId)
        .eq("location_id", locationId)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, reservation: data });
    }

    let approved = existing;
    if (existing.status !== "confirmed") {
      const { data, error } = await supabaseAdmin
        .from("location_reservations")
        .update({ status: "confirmed", updated_at: new Date().toISOString() })
        .eq("id", reservationId)
        .eq("location_id", locationId)
        .select("*")
        .single();
      if (error) throw error;
      approved = data;
    }

    approved = await assignLargeGroupTables(approved, locationId);
    const notifications = await sendConfirmation(approved, locationId);

    return NextResponse.json({ success: true, reservation: approved, notifications });
  } catch (error) {
    console.error("LARGE_GROUP_REVIEW_ERROR", error);
    return NextResponse.json({ error: "We could not update this large group booking." }, { status: 500 });
  }
}
