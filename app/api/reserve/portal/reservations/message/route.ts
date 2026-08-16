import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";
import { getReserveCanonicalLocationId, requireReservePermission } from "@/lib/reserve/locationPermissions";
import { sendSms } from "@/lib/sms/sendSms";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import {
  appendReservationMessage,
  getLocationReservationConversationSummary,
  getReservationThread,
  reservationReplyTo,
} from "@/lib/communications/reservation-thread";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
const providerMessage = "Messaging provider is not configured yet.";

async function requireMessagingAccess(locationId: string) {
  const admin = await requireAdminLocationApiWrite();
  if (!admin.error) return { adminUser: admin.adminUser, canonicalLocationId: locationId };

  const permission = await requireReservePermission(locationId, "manageReservations");
  if (permission.error) return { error: permission.error };
  return {
    adminUser: null,
    canonicalLocationId: getReserveCanonicalLocationId(permission.access, locationId),
  };
}

async function loadReservation(reservationId: string, requestedLocationId: string) {
  const result = await supabaseAdmin.from("location_reservations").select("*").eq("id", reservationId).maybeSingle();
  if (result.error || !result.data) return { error: NextResponse.json({ error: "We could not find that reservation." }, { status: 404 }) };
  const locationId = clean(result.data.location_id);
  if (!locationId || locationId !== requestedLocationId) return { error: NextResponse.json({ error: "We could not find that reservation for this location." }, { status: 404 }) };
  return { reservation: result.data, locationId };
}

export async function GET(request: NextRequest) {
  const requestedLocationId = clean(request.nextUrl.searchParams.get("location_id") || request.nextUrl.searchParams.get("adminLocationId"));
  if (!requestedLocationId) return NextResponse.json({ error: "Missing location ID." }, { status: 400 });
  const access = await requireMessagingAccess(requestedLocationId);
  if (access.error) return access.error;
  const locationId = access.canonicalLocationId!;

  if (request.nextUrl.searchParams.get("summary") === "1") {
    try {
      const rows = await getLocationReservationConversationSummary(locationId);
      return NextResponse.json({ conversations: rows });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Conversation summary could not be loaded." }, { status: 500 });
    }
  }

  const reservationId = clean(request.nextUrl.searchParams.get("reservation_id"));
  if (!reservationId) return NextResponse.json({ error: "Missing reservation ID." }, { status: 400 });
  const loaded = await loadReservation(reservationId, locationId);
  if (loaded.error) return loaded.error;

  try {
    const thread = await getReservationThread(reservationId, locationId, request.nextUrl.searchParams.get("mark_read") === "1");
    return NextResponse.json(thread);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Conversation could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const reservationId = clean(body.reservation_id);
  const requestedLocationId = clean(body.location_id || body.adminLocationId);
  const channel = clean(body.channel || "sms").toLowerCase();
  const message = clean(body.message);
  if (!reservationId || !requestedLocationId) return NextResponse.json({ error: "Missing reservation or location ID." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Enter a message before sending." }, { status: 400 });
  if (!["sms", "email", "both"].includes(channel)) return NextResponse.json({ error: "Choose SMS, Email, or Both." }, { status: 400 });

  const access = await requireMessagingAccess(requestedLocationId);
  if (access.error) return access.error;
  const locationId = access.canonicalLocationId!;
  const loaded = await loadReservation(reservationId, locationId);
  if (loaded.error) return loaded.error;
  const before = { data: loaded.reservation };

  const wantsSms = channel === "sms" || channel === "both";
  const wantsEmail = channel === "email" || channel === "both";
  const results: string[] = [];
  try {
    if (wantsSms) {
      if (!before.data.customer_phone) return NextResponse.json({ error: "This reservation does not have a phone number." }, { status: 400 });
      const sms = await sendSms({ to: before.data.customer_phone, body: message });
      await appendReservationMessage({
        reservation: before.data,
        direction: "outbound",
        channel: "sms",
        body: message,
        provider: "telnyx",
        providerMessageId: clean((sms as any)?.id) || null,
        sourceRecordId: clean((sms as any)?.id) ? `telnyx:${(sms as any).id}` : `reservation:${reservationId}:sms:${crypto.randomUUID()}`,
        recipientAddress: before.data.customer_phone,
      });
      results.push("SMS sent");
    }
    if (wantsEmail) {
      if (!before.data.customer_email) return NextResponse.json({ error: "This reservation does not have an email address." }, { status: 400 });
      const email = await sendRawBrandedEmail({
        to: before.data.customer_email,
        subject: "Your TheOutHaven reservation",
        heading: "Reservation update",
        body: message,
        department: "reservations",
        replyTo: reservationReplyTo(reservationId),
      });
      if (email.status === "skipped") return NextResponse.json({ error: providerMessage }, { status: 503 });
      if (email.status === "error") return NextResponse.json({ error: email.error || "Email could not be sent." }, { status: 502 });
      await appendReservationMessage({
        reservation: before.data,
        direction: "outbound",
        channel: "email",
        body: message,
        subject: "Your TheOutHaven reservation",
        provider: "resend",
        providerMessageId: clean(email.id) || null,
        sourceRecordId: clean(email.id) ? `resend:${email.id}` : `reservation:${reservationId}:email:${crypto.randomUUID()}`,
        recipientAddress: before.data.customer_email,
        metadata: { reply_to: reservationReplyTo(reservationId) || null },
      });
      results.push("Email sent");
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : "Message could not be sent.";
    return NextResponse.json({ error: text.toLowerCase().includes("provider") || text.toLowerCase().includes("twilio") || text.toLowerCase().includes("telnyx") ? providerMessage : text }, { status: text.toLowerCase().includes("configured") ? 503 : 502 });
  }

  if (access.adminUser) {
    await logAdminLocationAction({ adminUser: access.adminUser, locationId, actionType: "admin_reservation_message", targetType: "reservation", targetId: reservationId, beforeData: before.data, afterData: before.data, metadata: { channel, messageLength: message.length, results }, request });
  }
  return NextResponse.json({ success: true, message: results.join(" and ") || "Message sent." });
}
