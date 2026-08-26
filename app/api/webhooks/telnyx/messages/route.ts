import { createPublicKey, verify } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizePhone,
  sendConciergeSms,
  sendCrmSms,
  sendReservationSms,
  sendSupportSms,
  TELNYX_CHANNEL_NUMBERS,
} from "@/lib/sms/telnyx";
import { appendReservationMessage, findReservationForInboundSms } from "@/lib/communications/reservation-thread";
import { CRM_MAIN_NUMBER, routeInboundCrmSms } from "@/lib/crm/inbound-sms-routing";
import { routeInboundSupportSms } from "@/lib/support/sms-routing";
import { routeSupportFromSmsChannel } from "@/lib/support/cross-channel-sms";
import { processReservationSmsAction } from "@/lib/reservations/sms-actions";
import { routeReservationFromSmsChannel } from "@/lib/reservations/cross-channel-handoff";
import { cancelSmsReviewConversation, processSmsReviewReply } from "@/lib/reviews/sms-review-conversation";
import { processInternalReservationReviewConsentReply } from "@/lib/reviews/internal-reservation-review-consent";
import { routeConciergeInboundAtEdge } from "@/lib/concierge/edge-router";
import { classifyConciergeDepartment } from "@/lib/concierge/department-routing";

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
  if (to === TELNYX_CHANNEL_NUMBERS.concierge) return "concierge";
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
        channel === "concierge" ? cancelSmsReviewConversation(from) : Promise.resolve(),
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

      if (firstDelivery && channel === "concierge") await sendConciergeSms({ to: from, body: "TheOutHaven Concierge texts are enabled. Reply STOP to stop messages or HELP for help." });
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

    if (channel === "concierge") {
      if (text === "HELP") {
        await sendConciergeSms({
          to: from,
          body: "TheOutHaven Concierge: ask me for an address, hours, directions, or other information about a location or your outing. If I asked about a booking or review, you can reply naturally. Reply STOP to stop messages.",
        });
        return NextResponse.json({ received: true, action: "concierge_help" });
      }

      const consentResult = await processInternalReservationReviewConsentReply({
        from,
        body: rawText,
        providerMessageId,
      });
      if (consentResult.handled) {
        return NextResponse.json({
          received: true,
          action: consentResult.action || "concierge_review_consent_reply",
          review: consentResult,
        });
      }

      const reviewResult = await processSmsReviewReply({ from, body: rawText, eventId, providerMessageId });
      if (reviewResult.handled) return NextResponse.json({ received: true, action: reviewResult.action || "concierge_review_reply", review: reviewResult });

      const department = classifyConciergeDepartment(rawText);
      if (department === "support") {
        const supportRoute = await routeSupportFromSmsChannel({ from, to, body: rawText, eventId, providerMessageId });
        await supabaseAdmin.from("sms_logs").insert({
          customer_phone: from,
          message_type: "incoming_concierge_handoff_support",
          message_body: rawText,
          provider: "telnyx",
          provider_message_id: providerMessageId,
          status: "received",
          created_at: new Date().toISOString(),
          metadata: {
            routed_by: "concierge-department-router",
            handling_department: "support",
            support_ticket_id: supportRoute?.ticketId || null,
          },
        });
        return NextResponse.json({ received: true, action: "concierge_handoff_support", ticketId: supportRoute?.ticketId || null });
      }

      if (department === "reservations") {
        const reservationRoute = await routeReservationFromSmsChannel({ from, to, body: rawText, eventId, providerMessageId });
        await supabaseAdmin.from("sms_logs").insert({
          location_id: reservationRoute?.locationId || null,
          reservation_id: reservationRoute?.reservationId || null,
          customer_phone: from,
          message_type: `incoming_concierge_handoff_${reservationRoute?.action || "reservations"}`,
          message_body: rawText,
          provider: "telnyx",
          provider_message_id: providerMessageId,
          status: "received",
          created_at: new Date().toISOString(),
          metadata: {
            routed_by: "concierge-department-router",
            handling_department: "reservations",
            reservation_id: reservationRoute?.reservationId || null,
            matched: reservationRoute?.matched || false,
          },
        });
        return NextResponse.json({
          received: true,
          action: reservationRoute?.action || "concierge_handoff_reservations",
          reservationId: reservationRoute?.reservationId || null,
        });
      }

      const conciergeResult = await routeConciergeInboundAtEdge({ from, body: rawText });
      if (conciergeResult.handled && conciergeResult.reply) {
        await sendConciergeSms({ to: from, body: conciergeResult.reply });
        await supabaseAdmin.from("sms_logs").insert({
          location_id: conciergeResult.locationId || null,
          customer_phone: from,
          message_type: `incoming_concierge_${conciergeResult.action || "handled"}`,
          message_body: rawText,
          provider: "telnyx",
          provider_message_id: providerMessageId,
          status: "received",
          created_at: new Date().toISOString(),
          metadata: { routed_by: "concierge-router" },
        });
        return NextResponse.json({ received: true, action: conciergeResult.action || "concierge_edge_handled" });
      }

      await supabaseAdmin.from("sms_logs").insert({
        customer_phone: from,
        message_type: "incoming_concierge_unmatched",
        message_body: rawText,
        provider: "telnyx",
        provider_message_id: providerMessageId,
        status: "received",
        created_at: new Date().toISOString(),
        metadata: conciergeResult.error ? { edge_router_error: conciergeResult.error } : { routed_by: "concierge-router" },
      });
      return NextResponse.json({ received: true, action: "concierge_unmatched" });
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

      await sendReservationSms({
        to: from,
        body: reservation
          ? "I received your message, but I’m not sure what you want to change. You can reply CHANGE, CANCEL, DETAILS, or tell me the new date, time, or party size in your own words."
          : "I received your message, but I couldn’t match this phone number to an active reservation. Reply HELP for assistance.",
      });

      await supabaseAdmin.from("sms_logs").insert({
        location_id: reservation?.location_id || null,
        reservation_id: reservation?.id || null,
        customer_phone: from,
        message_type: reservation ? "incoming_reservation_clarification" : "incoming_reservation_unmatched",
        message_body: rawText,
        provider: "telnyx",
        provider_message_id: providerMessageId,
        status: "received",
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ received: true, action: reservation ? "reservation_clarification_sent" : "reservation_unmatched_clarification_sent" });
    }
  }

  if (eventType === "message.sent" || eventType === "message.finalized") {
    const messageId = String(payload?.id || "");
    const status = String(payload?.to?.[0]?.status || "sent");
    await updateDelivery(messageId, status, payload);
  }
  return NextResponse.json({ received: true });
}