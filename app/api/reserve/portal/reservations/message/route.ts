import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";
import { sendSms } from "@/lib/sms/sendSms";
import { sendRawBrandedEmail } from "@/lib/email/sender";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
const providerMessage = "Messaging provider is not configured yet.";

export async function POST(request: NextRequest) {
  const auth = await requireAdminLocationApiWrite();
  if (auth.error) return auth.error;
  const body = await request.json();
  const reservationId = clean(body.reservation_id);
  const requestedLocationId = clean(body.location_id || body.adminLocationId);
  const channel = clean(body.channel || "sms").toLowerCase();
  const message = clean(body.message);
  if (!reservationId || !requestedLocationId) return NextResponse.json({ error: "Missing reservation or location ID." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Enter a message before sending." }, { status: 400 });

  const before = await supabaseAdmin.from("location_reservations").select("*").eq("id", reservationId).maybeSingle();
  if (before.error || !before.data) return NextResponse.json({ error: "We could not find that reservation." }, { status: 404 });
  const locationId = clean(before.data.location_id);
  if (!locationId || locationId !== requestedLocationId) return NextResponse.json({ error: "We could not find that reservation for this location." }, { status: 404 });

  const wantsSms = channel === "sms" || channel === "both";
  const wantsEmail = channel === "email" || channel === "both";
  const results: string[] = [];
  try {
    if (wantsSms) {
      if (!before.data.customer_phone) return NextResponse.json({ error: "This reservation does not have a phone number." }, { status: 400 });
      await sendSms({ to: before.data.customer_phone, body: message });
      results.push("SMS sent");
    }
    if (wantsEmail) {
      if (!before.data.customer_email) return NextResponse.json({ error: "This reservation does not have an email address." }, { status: 400 });
      const email = await sendRawBrandedEmail({ to: before.data.customer_email, subject: "Your TheOutHaven reservation", heading: "Reservation update", body: message, department: "reservations" });
      if (email.status === "skipped") return NextResponse.json({ error: providerMessage }, { status: 503 });
      if (email.status === "error") return NextResponse.json({ error: email.error || "Email could not be sent." }, { status: 502 });
      results.push("Email sent");
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : "Message could not be sent.";
    return NextResponse.json({ error: text.toLowerCase().includes("provider") || text.toLowerCase().includes("twilio") ? providerMessage : text }, { status: text.toLowerCase().includes("configured") ? 503 : 502 });
  }

  await logAdminLocationAction({ adminUser: auth.adminUser, locationId, actionType: "admin_reservation_message", targetType: "reservation", targetId: reservationId, beforeData: before.data, afterData: before.data, metadata: { channel, messageLength: message.length, results }, request });
  return NextResponse.json({ success: true, message: results.join(" and ") || "Message sent." });
}
