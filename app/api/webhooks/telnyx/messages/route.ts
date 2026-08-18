import { createPublicKey, verify } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizePhone,
  sendCrmSms,
  sendReservationSms,
  sendSupportSms,
  TELNYX_CHANNEL_NUMBERS,
} from "@/lib/sms/telnyx";
import { appendReservationMessage, findReservationForInboundSms } from "@/lib/communications/reservation-thread";
import { CRM_MAIN_NUMBER, routeInboundCrmSms } from "@/lib/crm/inbound-sms-routing";
import { routeInboundSupportSms } from "@/lib/support/sms-routing";
import { processReservationSmsAction } from "@/lib/reservations/sms-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "END", "QUIT"]);
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

function channelForNumber(to: string) {
  if (to === TELNYX_CHANNEL_NUMBERS.crm) return "crm";
  if (to === TELNYX_CHANNEL_NUMBERS.reservations) return "reservations";
  if (to === TELNYX_CHANNEL_NUMBERS.support) return "support";
  if (to === TELNYX_CHANNEL_NUMBERS.marketing) return "marketing";
  if (to === TELNYX_CHANNEL_NUMBERS.inactive) return "inactive";
  return "unknown";
}

async function logComplianceKeyword(phone: string, keyword: string, action: "stop" | "start", channel: string) {
  await supabaseAdmin.from("sms_logs").insert({
    customer_phone: phone,
    message_type: `incoming_${channel}_${action}`,
    message_body: keyword,
    provider: "telnyx",
    status: "received",
    created_at: new Date().toISOString(),
  });
}

async function updateCrmSmsConsent(phone: string, action: "stop" | "start") {
  const normalized = normalizePhone(phone);
  if (!normalized) return;
  const { data: exact, error } = await supabaseAdmin
    .from("crm_contacts")
    .select("id")
    .eq("phone_e164", normalized)
    .is("archived_at", null);
  if (error) throw error;
  if (!exact?.length) return;
  await supabaseAdmin
    .from("crm_contacts")
    .update({ sms_consent_status: action === "stop" ? "opted_out" : "granted", updated_at: new Date().toISOString() })
    .in("id", exact.map((contact) => contact.id));
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
  const failed = normalizedStatus.includes("failed");
  const delivered = normalizedStatus === "delivered";
  await Promise.all([
    supabaseAdmin.from("marketing_send_logs").update({ status: delivered ? "sent" : failed ? "failed" : "sent", provider_response: payload as Record<string, unknown> }).eq("provider", "telnyx").contains("provider_response", { id: messageId }),
    supabaseAdmin.from("crm_messages").update({ status: delivered ? "delivered" : failed ? "failed" : "sent", delivered_at: delivered ? now : null, failed_at: failed ? now : null, metadata: { telnyx_delivery: payload }, updated_at: now }).eq("provider", "telnyx").eq("provider_message_id", messageId),
    supabaseAdmin.from("crm_message_recipients").update({ delivery_status: normalizedStatus }).eq("provider_recipient_id", messageId),
    supabaseAdmin.from("support_ticket_messages").update({
      delivery_status: normalizedStatus,
      delivered_at: delivered ? now : null,
      failed_at: failed ? now : null,
      metadata: { telnyx_delivery: payload },
    }).eq("provider", "telnyx").eq("provider_message_id", messageId).eq("direction", "outbound"),
  ]);
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

  const firstDelivery = await recordWebhook(eventId, eventType, payload);
  if (!firstDelivery && eventType !== "message.received") return NextResponse.json({ received: true, duplicate: true });

  if (eventType === "message.received") {
    const from = normalizePhone(payload?.from?.phone_number || "");
    const to = normalizePhone(payload?.to?.[0]?.phone_number || payload?.to?.phone_number || "");
    const rawText = String(payload?.text || "").trim();
    const text = rawText.toUpperCase();
    const providerMessageId = String(payload?.id || "") || null;
    const channel = channelForNumber(to);
    const isCrmMainNumber = channel === "crm" && to === CRM_MAIN_NUMBER;

    if (!from) return NextResponse.json({ received: true });
    if (channel === "inactive") return NextResponse.json({ received: true, action: "inactive_number_ignored" });
    if (channel === "unknown") return NextResponse.json({ received: true, action: "unknown_number_ignored" });
    if (!firstDelivery && channel !== "crm" && channel !== "support") return NextResponse.json({ received: true, duplicate: true });

    if (STOP_WORDS.has(text)) {
      await Promise.all([
        logComplianceKeyword(from, text, "stop", channel),
        isCrmMainNumber ? updateCrmSmsConsent(from, "stop") : Promise.resolve(),
      ]);
      const crmRoute = isCrmMainNumber
        ? await routeInboundCrmSms({ from, to, body: rawText, eventId, providerMessageId, complianceKeyword: "stop" })
        : null;
      return NextResponse.json({
        received: true,
        duplicate: !firstDelivery,
        action: `${channel}_stop_recorded`,
        routing: crmRoute ? (crmRoute.matched ? "matched" : "unmatched") : null,
      });
    }

    if (START_WORDS.has(text)) {
      await Promise.all([
        logComplianceKeyword(from, text, "start", channel),
        isCrmMainNumber ? updateCrmSmsConsent(from, "start") : Promise.resolve(),
      ]);
      const crmRoute = isCrmMainNumber
        ? await routeInboundCrmSms({ from, to, body: rawText, eventId, providerMessageId, complianceKeyword: "start" })
        : null;

      if (firstDelivery && channel === "crm") await sendCrmSms({ to: from, body: "TheOutHaven CRM SMS updates are enabled. Reply STOP to stop messages or HELP for help." });
      if (firstDelivery && channel === "reservations") await sendReservationSms({ to: from, body: "TheOutHaven reservation SMS updates are enabled. Reply STOP to stop messages or HELP for help." });
      if (firstDelivery && channel === "support") await sendSupportSms({ to: from, body: "TheOutHaven support SMS updates are enabled. Reply STOP to stop messages or HELP for help." });

      return NextResponse.json({
        received: true,
        duplicate: !firstDelivery,
        action: `${channel}_start_recorded`,
        routing: crmRoute ? (crmRoute.matched ? "matched" : "unmatched") : null,
      });
    }

    if (channel === "support") {
      if (firstDelivery && text === "HELP") {
        await sendSupportSms({ to: from, body: "TheOutHaven Support: send your question here and it will be added to your support ticket. Reply STOP to stop SMS replies." });
        return NextResponse.json({ received: true, action: "support_help" });
      }
      const supportRoute = await routeInboundSupportSms({ from, to, body: rawText, eventId, providerMessageId });
      return NextResponse.json({
        received: true,
        duplicate: supportRoute?.duplicate || !firstDelivery,
        action: "support_message_received",
        ticketId: supportRoute?.ticketId || null,
        messageId: supportRoute?.messageId || null,
      });
    }

    if (isCrmMainNumber) {
      const crmRoute = await routeInboundCrmSms({ from, to, body: rawText, eventId, providerMessageId });
      if (firstDelivery && text === "HELP") await sendCrmSms({ to: from, body: "TheOutHaven CRM: reply STOP to stop CRM messages or visit theouthaven.com for support." });
      if (firstDelivery) {
        await supabaseAdmin.from("sms_logs").insert({
          location_id: crmRoute?.locationId || null,
          customer_phone: from,
          message_type: crmRoute?.matched ? "incoming_crm_message" : "incoming_crm_unmatched",
          message_body: rawText,
          provider: "telnyx",
          provider_message_id: providerMessageId,
          status: "received",
          created_at: new Date().toISOString(),
        });
      }
      return NextResponse.json({
        received: true,
        duplicate: !firstDelivery,
        action: text === "HELP" ? "crm_help" : "crm_message_received",
        routing: crmRoute?.matched ? "matched" : "unmatched",
        conversationId: crmRoute?.conversationId || null,
      });
    }

    if (channel === "marketing") {
      if (text === "HELP") return NextResponse.json({ received: true, action: "marketing_help_recorded" });
      await supabaseAdmin.from("sms_logs").insert({
        customer_phone: from,
        message_type: "incoming_marketing_message",
        message_body: rawText,
        provider: "telnyx",
        provider_message_id: providerMessageId,
        status: "received",
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ received: true, action: "marketing_message_recorded" });
    }

    if (channel === "reservations") {
      if (text === "HELP") {
        await sendReservationSms({ to: from, body: "TheOutHaven Reservations: reply CHANGE to reschedule or change party size, CANCEL to cancel, DETAILS for your reservation, STOP to stop SMS updates, or just text your request naturally." });
        return NextResponse.json({ received: true, action: "reservation_help" });
      }

      const actionResult = await processReservationSmsAction({
        from,
        text: rawText,
        providerMessageId,
        eventId,
        to,
      });
      if (actionResult.handled) {
        await supabaseAdmin.from("sms_logs").insert({
          customer_phone: from,
          message_type: `incoming_reservation_action_${actionResult.action || "handled"}`,
          message_body: rawText,
          provider: "telnyx",
          provider_message_id: providerMessageId,
          status: "received",
          created_at: new Date().toISOString(),
        });
        return NextResponse.json({ received: true, ...actionResult });
      }

      const reservation = await findReservationForInboundSms(from);
      if (reservation) {
        await appendReservationMessage({
          reservation,
          direction: "inbound",
          channel: "sms",
          body: rawText,
          provider: "telnyx",
          providerMessageId,
          sourceRecordId: `telnyx-event:${eventId}`,
          recipientAddress: from,
          metadata: { telnyx_event_id: eventId, to },
        });
      }
      await supabaseAdmin.from("sms_logs").insert({
        location_id: reservation?.location_id || null,
        reservation_id: reservation?.id || null,
        customer_phone: from,
        message_type: reservation ? "incoming_reservation_message" : "incoming_reservation_unmatched",
        message_body: rawText,
        provider: "telnyx",
        provider_message_id: providerMessageId,
        status: "received",
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ received: true, action: reservation ? "reservation_message_received" : "reservation_unmatched" });
    }
  }

  if (eventType === "message.sent" || eventType === "message.finalized") {
    const messageId = String(payload?.id || "");
    const status = String(payload?.to?.[0]?.status || "sent");
    await updateDelivery(messageId, status, payload);
  }
  return NextResponse.json({ received: true });
}
