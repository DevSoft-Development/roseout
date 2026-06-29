import { NextRequest, NextResponse } from "next/server";
import { requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendReservationSms } from "@/lib/reservationOperations";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminLocationApiWrite();
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const reservationId = clean(body.reservation_id);
    const locationId = clean(body.adminLocationId || body.location_id);

    if (!reservationId || !locationId) {
      return NextResponse.json({ success: false, error: "Missing reservation or location ID." }, { status: 400 });
    }

    const before = await supabaseAdmin
      .from("location_reservations")
      .select("*")
      .eq("id", reservationId)
      .eq("location_id", locationId)
      .maybeSingle();

    if (!before.data) {
      return NextResponse.json({ success: false, error: "We could not find that reservation." }, { status: 404 });
    }

    const reservation = before.data as any;
    const hasAssignedResource = Boolean(
      reservation.assigned_resource_id ||
      reservation.assigned_layout_item_id ||
      reservation.assigned_resource_label ||
      reservation.reservable_item_name ||
      reservation.bookable_item_id ||
      reservation.bookable_item_name,
    );

    if (!["checked_in", "arrived"].includes(String(reservation.status || ""))) {
      return NextResponse.json({ success: false, error: "Check in this guest before sending a table ready text." }, { status: 400 });
    }

    if (!hasAssignedResource) {
      return NextResponse.json({ success: false, error: "Choose a table before sending a table ready text." }, { status: 400 });
    }

    if (!clean(reservation.customer_phone)) {
      return NextResponse.json({ success: false, error: "Add a phone number before sending a table ready text." }, { status: 400 });
    }

    const existing = await supabaseAdmin
      .from("sms_logs")
      .select("id,sent_at,created_at,status")
      .eq("reservation_id", reservationId)
      .eq("message_type", "item_ready")
      .in("status", ["queued", "sent", "delivered", "accepted", "skipped"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.data) {
      return NextResponse.json({ success: true, alreadySent: true, sms: existing.data, reservation });
    }

    const locationName = clean(reservation.location_name || reservation.restaurant_name) || "this location";
    const result = await sendReservationSms({
      locationId,
      reservationId,
      to: reservation.customer_phone,
      messageType: "item_ready",
      body: `TheOutHaven Reserve: Your table is ready at ${locationName}. Please see the host stand.`,
    });

    await logAdminLocationAction({
      adminUser: auth.adminUser,
      locationId,
      actionType: "admin_reservation_table_ready_sms",
      targetType: "reservation",
      targetId: reservationId,
      beforeData: before.data,
      afterData: { sms: result },
      request,
    });

    const sms = await supabaseAdmin
      .from("sms_logs")
      .select("id,sent_at,created_at,status")
      .eq("reservation_id", reservationId)
      .eq("message_type", "item_ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ success: true, sms: sms.data || result, reservation });
  } catch (error) {
    console.error("RESERVE_TABLE_READY_SMS_FAILED", error);
    return NextResponse.json({ success: false, error: "We could not send the table ready text." }, { status: 500 });
  }
}
