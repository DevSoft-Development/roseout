import { createPublicKey, verify } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendSms } from "@/lib/sms/sendSms";
import { normalizePhone } from "@/lib/sms/telnyx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_WORDS = new Set(["START", "UNSTOP"]);

function buildPublicKey(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) return createPublicKey(trimmed);
  const raw = Buffer.from(trimmed, "base64");
  if (raw.length !== 32) throw new Error("TELNYX_PUBLIC_KEY must be a PEM key or base64 Ed25519 public key.");
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({ key: Buffer.concat([spkiPrefix, raw]), format: "der", type: "spki" });
}

function verifyWebhook(rawBody: string, signature: string, timestamp: string) {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey || !signature || !timestamp) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
  return verify(null, Buffer.from(`${timestamp}|${rawBody}`), buildPublicKey(publicKey), Buffer.from(signature, "base64"));
}

async function updateOptOut(phone: string, optedIn: boolean) {
  const now = new Date().toISOString();
  const optedOutAt = optedIn ? null : now;
  await Promise.all([
    supabaseAdmin.from("marketing_subscribers").update({ sms_opt_in: optedIn, sms_opted_out_at: optedOutAt, updated_at: now }).eq("phone", phone),
    supabaseAdmin.from("user_marketing_preferences").update({ sms_opt_in: optedIn, sms_opted_out_at: optedOutAt, updated_at: now }).eq("phone", phone),
    supabaseAdmin.from("users").update({ marketing_opt_in: optedIn }).eq("phone", phone),
  ]);
}

async function cancelLatestReservation(phone: string) {
  const { data: reservation, error } = await supabaseAdmin
    .from("location_reservations")
    .select("id,location_id")
    .eq("customer_phone", phone)
    .in("status", ["pending", "confirmed", "arrived"])
    .order("reservation_date", { ascending: true })
    .order("reservation_time", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!reservation) return false;
  const now = new Date().toISOString();
  await supabaseAdmin.from("location_reservations").update({ status: "cancelled", customer_cancelled_at: now, updated_at: now }).eq("id", reservation.id);
  await supabaseAdmin.from("sms_logs").insert({
    location_id: reservation.location_id,
    reservation_id: reservation.id,
    customer_phone: phone,
    message_type: "incoming_cancel",
    message_body: "CANCEL",
    provider: "telnyx",
    status: "received",
    created_at: now,
  });
  return true;
}

async function recordWebhook(eventId: string, eventType: string, payload: unknown) {
  const { error } = await supabaseAdmin.from("telnyx_webhook_events").insert({ event_id: eventId, event_type: eventType, payload });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

async function updateDelivery(messageId: string, status: string, payload: unknown) {
  if (!messageId) return;
  await supabaseAdmin
    .from("marketing_send_logs")
    .update({ status: status === "delivered" ? "sent" : status.includes("failed") ? "failed" : "sent", provider_response: payload as Record<string, unknown> })
    .eq("provider", "telnyx")
    .contains("provider_response", { id: messageId });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("telnyx-signature-ed25519") || "";
  const timestamp = req.headers.get("telnyx-timestamp") || "";
  if (!verifyWebhook(rawBody, signature, timestamp)) return NextResponse.json({ error: "Invalid Telnyx signature" }, { status: 403 });

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = String(event?.data?.id || "");
  const eventType = String(event?.data?.event_type || "");
  const payload = event?.data?.payload || {};
  if (!eventId || !eventType) return NextResponse.json({ error: "Invalid Telnyx event" }, { status: 400 });
  if (!(await recordWebhook(eventId, eventType, payload))) return NextResponse.json({ received: true, duplicate: true });

  if (eventType === "message.received") {
    const from = normalizePhone(payload?.from?.phone_number || "");
    const text = String(payload?.text || "").trim().toUpperCase();
    if (!from) return NextResponse.json({ received: true });

    if (STOP_WORDS.has(text) && text !== "CANCEL") {
      await updateOptOut(from, false);
      await supabaseAdmin.from("sms_logs").insert({ customer_phone: from, message_type: "incoming_stop", message_body: text, provider: "telnyx", status: "received", created_at: new Date().toISOString() });
      return NextResponse.json({ received: true, action: "opted_out" });
    }

    if (START_WORDS.has(text)) {
      await updateOptOut(from, true);
      await sendSms({ to: from, body: "TheOutHaven SMS updates are enabled again. Reply STOP to opt out or HELP for help." });
      return NextResponse.json({ received: true, action: "opted_in" });
    }

    if (text === "HELP") {
      await sendSms({ to: from, body: "TheOutHaven: reply CANCEL to cancel your latest reservation, STOP to opt out of marketing texts, or visit theouthaven.com for support." });
      return NextResponse.json({ received: true, action: "help" });
    }

    if (text === "CANCEL") {
      const cancelled = await cancelLatestReservation(from);
      await sendSms({ to: from, body: cancelled ? "Your latest TheOutHaven reservation has been cancelled." : "No active TheOutHaven reservation was found for this phone number." });
      return NextResponse.json({ received: true, action: cancelled ? "reservation_cancelled" : "no_reservation" });
    }

    await supabaseAdmin.from("sms_logs").insert({ customer_phone: from, message_type: "incoming_message", message_body: String(payload?.text || ""), provider: "telnyx", status: "received", created_at: new Date().toISOString() });
  }

  if (eventType === "message.sent" || eventType === "message.finalized") {
    const messageId = String(payload?.id || "");
    const status = String(payload?.to?.[0]?.status || "sent");
    await updateDelivery(messageId, status, payload);
  }

  return NextResponse.json({ received: true });
}
