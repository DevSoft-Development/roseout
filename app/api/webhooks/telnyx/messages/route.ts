import { createPublicKey, verify } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendSms } from "@/lib/sms/sendSms";
import { normalizePhone } from "@/lib/sms/telnyx";
import { appendReservationMessage, findReservationForInboundSms } from "@/lib/communications/reservation-thread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "END", "QUIT"]);
const START_WORDS = new Set(["START", "UNSTOP"]);
const CRM_MAIN_NUMBER = "+15162000811";

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

async function logComplianceKeyword(phone: string, keyword: string, action: "stop" | "start") {
  await supabaseAdmin.from("sms_logs").insert({
    customer_phone: phone,
    message_type: `incoming_${action}`,
    message_body: keyword,
    provider: "telnyx",
    status: "received",
    created_at: new Date().toISOString(),
  });
}

async function updateCrmSmsConsent(phone: string, action: "stop" | "start") {
  const normalized = normalizePhone(phone);
  if (!normalized) return;

  const { data: exact } = await supabaseAdmin
    .from("crm_contacts")
    .select("id")
    .eq("phone", normalized)
    .is("archived_at", null);

  if (!exact?.length) return;

  await supabaseAdmin
    .from("crm_contacts")
    .update({
      sms_consent_status: action === "stop" ? "opted_out" : "granted",
      updated_at: new Date().toISOString(),
    })
    .in("id", exact.map((contact) => contact.id));
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
  await supabaseAdmin.from("sms_logs").insert({ location_id: reservation.location_id, reservation_id: reservation.id, customer_phone: phone, message_type: "incoming_cancel", message_body: "CANCEL", provider: "telnyx", status: "received", created_at: now });
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
  const now = new Date().toISOString();
  const normalizedStatus = status.toLowerCase();
  await Promise.all([
    supabaseAdmin.from("marketing_send_logs").update({ status: normalizedStatus === "delivered" ? "sent" : normalizedStatus.includes("failed") ? "failed" : "sent", provider_response: payload as Record<string, unknown> }).eq("provider", "telnyx").contains("provider_response", { id: messageId }),
    supabaseAdmin.from("crm_messages").update({ status: normalizedStatus === "delivered" ? "delivered" : normalizedStatus.includes("failed") ? "failed" : "sent", delivered_at: normalizedStatus === "delivered" ? now : null, failed_at: normalizedStatus.includes("failed") ? now : null, metadata: { telnyx_delivery: payload }, updated_at: now }).eq("provider", "telnyx").eq("provider_message_id", messageId),
    supabaseAdmin.from("crm_message_recipients").update({ delivery_status: normalizedStatus }).eq("provider_recipient_id", messageId),
  ]);
}

async function appendInboundCrmSms(params: {
  from: string;
  body: string;
  eventId: string;
  providerMessageId: string | null;
  to: string;
}) {
  if (params.to !== CRM_MAIN_NUMBER) return null;

  const { data: recipientRows, error: recipientError } = await supabaseAdmin
    .from("crm_message_recipients")
    .select("message_id,created_at")
    .eq("address", params.from)
    .order("created_at", { ascending: false })
    .limit(10);

  if (recipientError || !recipientRows?.length) return null;

  const messageIds = recipientRows.map((row) => row.message_id);
  const { data: outboundMessages, error: messageError } = await supabaseAdmin
    .from("crm_messages")
    .select("id,conversation_id,created_at")
    .in("id", messageIds)
    .eq("channel", "sms")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1);

  if (messageError || !outboundMessages?.[0]?.conversation_id) return null;
  const conversationId = outboundMessages[0].conversation_id;

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("crm_conversations")
    .select("id,location_id,unread_count")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversation) return null;

  const now = new Date().toISOString();
  const { data: inbound, error: inboundError } = await supabaseAdmin
    .from("crm_messages")
    .insert({
      conversation_id: conversationId,
      direction: "inbound",
      channel: "sms",
      message_type: "message",
      body_text: params.body,
      provider: "telnyx",
      provider_message_id: params.providerMessageId,
      status: "received",
      replied_at: now,
      source_system: "telnyx_webhook",
      source_record_id: `telnyx-event:${params.eventId}`,
      metadata: {
        telnyx_event_id: params.eventId,
        from: params.from,
        to: params.to,
      },
    })
    .select("id")
    .single();

  if (inboundError || !inbound?.id) {
    if (inboundError?.code === "23505") return conversation;
    throw inboundError || new Error("Unable to save inbound CRM SMS");
  }

  await Promise.all([
    supabaseAdmin
      .from("crm_conversations")
      .update({
        status: "waiting_on_team",
        last_message_at: now,
        last_inbound_at: now,
        is_unread: true,
        unread_count: Number(conversation.unread_count || 0) + 1,
        updated_at: now,
      })
      .eq("id", conversationId),
    conversation.location_id
      ? supabaseAdmin.from("crm_activities").insert({
          location_id: conversation.location_id,
          activity_type: "sms",
          direction: "inbound",
          channel: "sms",
          summary: `SMS reply received on ${CRM_MAIN_NUMBER}`,
          body: params.body,
          occurred_at: now,
          source_system: "telnyx_webhook",
          source_table: "crm_messages",
          source_record_id: inbound.id,
          visibility: "internal",
          is_system_generated: true,
          metadata: { from: params.from, to: params.to, providerMessageId: params.providerMessageId },
        })
      : Promise.resolve(),
  ]);

  return conversation;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("telnyx-signature-ed25519") || "";
  const timestamp = req.headers.get("telnyx-timestamp") || "";
  if (!verifyWebhook(rawBody, signature, timestamp)) return NextResponse.json({ error: "Invalid Telnyx signature" }, { status: 403 });

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const eventId = String(event?.data?.id || "");
  const eventType = String(event?.data?.event_type || "");
  const payload = event?.data?.payload || {};
  if (!eventId || !eventType) return NextResponse.json({ error: "Invalid Telnyx event" }, { status: 400 });
  if (!(await recordWebhook(eventId, eventType, payload))) return NextResponse.json({ received: true, duplicate: true });

  if (eventType === "message.received") {
    const from = normalizePhone(payload?.from?.phone_number || "");
    const to = normalizePhone(payload?.to?.[0]?.phone_number || payload?.to?.phone_number || "");
    const rawText = String(payload?.text || "").trim();
    const text = rawText.toUpperCase();
    if (!from) return NextResponse.json({ received: true });

    if (STOP_WORDS.has(text)) {
      await Promise.all([
        logComplianceKeyword(from, text, "stop"),
        to === CRM_MAIN_NUMBER ? updateCrmSmsConsent(from, "stop") : Promise.resolve(),
      ]);
      return NextResponse.json({ received: true, action: to === CRM_MAIN_NUMBER ? "crm_stop_recorded" : "transactional_stop_recorded" });
    }
    if (START_WORDS.has(text)) {
      await Promise.all([
        logComplianceKeyword(from, text, "start"),
        to === CRM_MAIN_NUMBER ? updateCrmSmsConsent(from, "start") : Promise.resolve(),
      ]);
      await sendSms({ to: from, body: "TheOutHaven transactional SMS updates are enabled. Reply STOP to stop messages or HELP for help." });
      return NextResponse.json({ received: true, action: to === CRM_MAIN_NUMBER ? "crm_start_recorded" : "transactional_start_recorded" });
    }
    if (text === "HELP") {
      await sendSms({ to: from, body: "TheOutHaven: reply CANCEL to cancel your latest reservation, STOP to stop transactional messages, or visit theouthaven.com for support." });
      return NextResponse.json({ received: true, action: "help" });
    }
    if (text === "CANCEL") {
      const cancelled = await cancelLatestReservation(from);
      await sendSms({ to: from, body: cancelled ? "Your latest TheOutHaven reservation has been cancelled." : "No active TheOutHaven reservation was found for this phone number." });
      return NextResponse.json({ received: true, action: cancelled ? "reservation_cancelled" : "no_reservation" });
    }

    const crmConversation = await appendInboundCrmSms({
      from,
      to,
      body: rawText,
      eventId,
      providerMessageId: String(payload?.id || "") || null,
    });

    const reservation = crmConversation ? null : await findReservationForInboundSms(from);
    if (reservation) {
      await appendReservationMessage({
        reservation,
        direction: "inbound",
        channel: "sms",
        body: rawText,
        provider: "telnyx",
        providerMessageId: String(payload?.id || "") || null,
        sourceRecordId: `telnyx-event:${eventId}`,
        recipientAddress: from,
        metadata: { telnyx_event_id: eventId, to },
      });
    }

    await supabaseAdmin.from("sms_logs").insert({
      location_id: crmConversation?.location_id || reservation?.location_id || null,
      reservation_id: reservation?.id || null,
      customer_phone: from,
      message_type: crmConversation ? "incoming_crm_message" : reservation ? "incoming_reservation_message" : "incoming_message",
      message_body: rawText,
      provider: "telnyx",
      provider_message_id: String(payload?.id || "") || null,
      status: "received",
      created_at: new Date().toISOString(),
    });
  }

  if (eventType === "message.sent" || eventType === "message.finalized") {
    const messageId = String(payload?.id || "");
    const status = String(payload?.to?.[0]?.status || "sent");
    await updateDelivery(messageId, status, payload);
  }
  return NextResponse.json({ received: true });
}
