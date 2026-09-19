import { createPublicKey, verify } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizePhone,
  sendConciergeSms,
  sendCrmSms,
  sendMarketingSms,
  sendReservationSms,
  sendSupportSms,
  sendTelnyxSmsFromNumber,
  TELNYX_CHANNEL_NUMBERS,
} from "@/lib/sms/telnyx";
import { classifySmsDepartment, type SmsDepartment } from "@/lib/communications/sms-intent-routing";
import { canonicalizeNaturalSmsContinuation } from "@/lib/communications/sms-natural-response";
import {
  appendReservationSmsContinuation,
  clearReservationSmsSession,
  findActiveReservationSmsOwnership,
  findActiveSupportSmsOwnership,
  findRecentExplicitSmsRouteOwnership,
  releaseReservationSmsOwnership,
  releaseSupportSmsOwnership,
} from "@/lib/communications/sms-flow-ownership";
import { appendReservationMessage, findReservationForInboundSms } from "@/lib/communications/reservation-thread";
import { CRM_MAIN_NUMBER, routeInboundCrmSms } from "@/lib/crm/inbound-sms-routing";
import { routeSupportFromSmsChannel } from "@/lib/support/cross-channel-sms";
import { activateSupportSmsOwnership } from "@/lib/support/sms-owner";
import { processReservationSmsAction } from "@/lib/reservations/sms-actions";
import { processReservationLateArrival } from "@/lib/reservations/sms-late-arrival";
import { routeReservationFromSmsChannel } from "@/lib/reservations/cross-channel-handoff";
import { cancelSmsReviewConversation, processSmsReviewReply } from "@/lib/reviews/sms-review-conversation";
import { processInternalReservationReviewConsentReply } from "@/lib/reviews/internal-reservation-review-consent";
import { routeConciergeInboundAtEdge } from "@/lib/concierge/edge-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "END", "QUIT"]);
const START_WORDS = new Set(["START", "UNSTOP"]);

type SmsEntryChannel = "concierge" | "crm" | "reservations" | "support" | "marketing" | "inactive" | "unknown";

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

function channelForNumber(to: string): SmsEntryChannel {
  if (to === TELNYX_CHANNEL_NUMBERS.concierge) return "concierge";
  if (to === TELNYX_CHANNEL_NUMBERS.crm) return "crm";
  if (to === TELNYX_CHANNEL_NUMBERS.reservations) return "reservations";
  if (to === TELNYX_CHANNEL_NUMBERS.support) return "support";
  if (to === TELNYX_CHANNEL_NUMBERS.marketing) return "marketing";
  if (to === TELNYX_CHANNEL_NUMBERS.inactive) return "inactive";
  return "unknown";
}

function routeTimestamp(value?: string | null) {
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
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

async function logDepartmentRoute(params: {
  from: string;
  entryChannel: SmsEntryChannel;
  target: SmsDepartment;
  body: string;
  providerMessageId: string | null;
  locationId?: string | null;
  reservationId?: string | null;
  ticketId?: string | null;
  action?: string | null;
}) {
  await supabaseAdmin.from("sms_logs").insert({
    location_id: params.locationId || null,
    reservation_id: params.reservationId || null,
    customer_phone: params.from,
    message_type: `incoming_${params.entryChannel}_routed_${params.target}`,
    message_body: params.body,
    provider: "telnyx",
    provider_message_id: params.providerMessageId,
    status: "received",
    created_at: new Date().toISOString(),
    metadata: {
      routed_by: "system-wide-sms-intent-router",
      entry_channel: params.entryChannel,
      handling_department: params.target,
      support_ticket_id: params.ticketId || null,
      reservation_id: params.reservationId || null,
      action: params.action || null,
    },
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

async function routeStrongIntent(params: {
  from: string;
  to: string;
  body: string;
  eventId: string;
  providerMessageId: string | null;
  entryChannel: SmsEntryChannel;
  target: SmsDepartment;
}) {
  if (params.entryChannel === "concierge") await cancelSmsReviewConversation(params.from);
  if (params.target !== "reservations") {
    await Promise.all([
      clearReservationSmsSession(params.from),
      releaseReservationSmsOwnership({ phone: params.from, entryNumber: params.to }),
    ]);
  }
  if (params.target !== "support") {
    await releaseSupportSmsOwnership({ phone: params.from, entryNumber: params.to });
  }

  if (params.target === "support") {
    const supportRoute = await routeSupportFromSmsChannel({
      from: params.from,
      to: params.to,
      body: params.body,
      eventId: params.eventId,
      providerMessageId: params.providerMessageId,
    });
    if (supportRoute?.ticketId) {
      await activateSupportSmsOwnership({ ticketId: supportRoute.ticketId, entryNumber: params.to });
    }
    await logDepartmentRoute({
      from: params.from,
      entryChannel: params.entryChannel,
      target: "support",
      body: params.body,
      providerMessageId: params.providerMessageId,
      ticketId: supportRoute?.ticketId || null,
      action: supportRoute?.topicBoundary ? "new_support_topic" : "support",
    });
    return NextResponse.json({
      received: true,
      action: `${params.entryChannel}_routed_support`,
      ticketId: supportRoute?.ticketId || null,
      topicBoundary: Boolean(supportRoute?.topicBoundary),
    });
  }

  if (params.target === "reservations" && params.entryChannel !== "reservations") {
    const reservationRoute = await routeReservationFromSmsChannel({
      from: params.from,
      to: params.to,
      body: params.body,
      eventId: params.eventId,
      providerMessageId: params.providerMessageId,
    });
    await logDepartmentRoute({
      from: params.from,
      entryChannel: params.entryChannel,
      target: "reservations",
      body: params.body,
      providerMessageId: params.providerMessageId,
      locationId: reservationRoute?.locationId || null,
      reservationId: reservationRoute?.reservationId || null,
      action: reservationRoute?.action || null,
    });
    return NextResponse.json({
      received: true,
      action: reservationRoute?.action || `${params.entryChannel}_routed_reservations`,
      reservationId: reservationRoute?.reservationId || null,
    });
  }

  if (params.target === "concierge") {
    const conciergeResult = await routeConciergeInboundAtEdge({ from: params.from, body: params.body });
    const reply = conciergeResult.handled && conciergeResult.reply
      ? conciergeResult.reply
      : "I can help with your outing here. Tell me the place or plan you mean and whether you need directions, hours, location details, or a recommendation.";
    await sendTelnyxSmsFromNumber({ to: params.from, body: reply, fromNumber: params.to });
    await logDepartmentRoute({
      from: params.from,
      entryChannel: params.entryChannel,
      target: "concierge",
      body: params.body,
      providerMessageId: params.providerMessageId,
      locationId: conciergeResult.locationId || null,
      action: conciergeResult.action || "concierge_fallback",
    });
    return NextResponse.json({ received: true, action: conciergeResult.action || `${params.entryChannel}_routed_concierge` });
  }

  return null;
}

async function routeOwnedContinuation(params: {
  from: string;
  to: string;
  body: string;
  eventId: string;
  providerMessageId: string | null;
  entryChannel: SmsEntryChannel;
}) {
  const [supportOwner, reservationOwner, recentRoute] = await Promise.all([
    findActiveSupportSmsOwnership({ phone: params.from, entryNumber: params.to }),
    findActiveReservationSmsOwnership({ phone: params.from, entryNumber: params.to }),
    findRecentExplicitSmsRouteOwnership({ phone: params.from, entryChannel: params.entryChannel }),
  ]);

  const candidates: Array<{ department: SmsDepartment; at: number }> = [];
  if (supportOwner) candidates.push({ department: "support", at: routeTimestamp(supportOwner.lastMessageAt) });
  if (reservationOwner) candidates.push({ department: "reservations", at: routeTimestamp(reservationOwner.lastMessageAt) });
  if (recentRoute) candidates.push({ department: recentRoute.department, at: routeTimestamp(recentRoute.lastMessageAt) });
  candidates.sort((left, right) => right.at - left.at);
  const owner = candidates[0]?.department;
  if (!owner) return null;

  if (owner === "support") {
    const result = await routeSupportFromSmsChannel({
      from: params.from,
      to: params.to,
      body: params.body,
      eventId: params.eventId,
      providerMessageId: params.providerMessageId,
    });
    if (result?.ticketId) await activateSupportSmsOwnership({ ticketId: result.ticketId, entryNumber: params.to });
    return NextResponse.json({
      received: true,
      action: `${params.entryChannel}_support_continuation`,
      ticketId: result?.ticketId || null,
    });
  }

  if (owner === "reservations" && params.entryChannel !== "reservations") {
    const result = await appendReservationSmsContinuation({
      phone: params.from,
      entryNumber: params.to,
      body: params.body,
      eventId: params.eventId,
      providerMessageId: params.providerMessageId,
    });
    if (!result) return null;
    return NextResponse.json({
      received: true,
      action: result.action,
      reservationId: result.reservationId,
      conversationId: result.conversationId,
    });
  }

  if (owner === "concierge" && params.entryChannel !== "concierge") {
    const conciergeResult = await routeConciergeInboundAtEdge({ from: params.from, body: params.body });
    const reply = conciergeResult.handled && conciergeResult.reply
      ? conciergeResult.reply
      : "I’m still with you on the outing. Tell me the place or plan you mean and what you need next.";
    await sendTelnyxSmsFromNumber({ to: params.from, body: reply, fromNumber: params.to });
    return NextResponse.json({ received: true, action: `${params.entryChannel}_concierge_continuation` });
  }

  return null;
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

      if (firstDelivery && channel === "concierge") await sendConciergeSms({ to: from, body: "TheOutHaven Concierge texts are enabled. Just text naturally for outing help, directions, hours, recommendations, booking follow-ups, or reviews. Reply HELP for options or STOP to stop messages." });
      if (firstDelivery && channel === "crm") await sendCrmSms({ to: from, body: "TheOutHaven CRM texts are enabled. Reply naturally with your question or update and our team will keep it with your conversation. Reply HELP for options or STOP to stop messages." });
      if (firstDelivery && channel === "reservations") await sendReservationSms({ to: from, body: "TheOutHaven reservation texts are enabled. Reply naturally to reschedule, change date/time or guest count, report that you're running late, review details, or cancel. Reply HELP for options or STOP to stop messages." });
      if (firstDelivery && channel === "support") await sendSupportSms({ to: from, body: "TheOutHaven support texts are enabled. Send your question naturally here and it will stay with your support conversation. Reply HELP for options or STOP to stop messages." });
      if (firstDelivery && channel === "marketing") await sendMarketingSms({ to: from, body: "TheOutHaven updates are enabled. You can reply naturally with a question or request, HELP for options, or STOP to opt out." });

      return NextResponse.json({
        received: true,
        duplicate: !firstDelivery,
        action: `${channel}_start_recorded`,
        routing: crmRoute ? (crmRoute.matched ? "matched" : "unmatched") : null,
      });
    }

    let strongDepartment: SmsDepartment | null = null;
    if (text !== "HELP") {
      strongDepartment = classifySmsDepartment(rawText);
      if (strongDepartment) {
        const currentDepartment = channel === "support" || channel === "reservations" || channel === "concierge" ? channel : null;
        const shouldRouteNow = strongDepartment !== currentDepartment || strongDepartment === "support" || strongDepartment === "concierge";
        if (shouldRouteNow) {
          const routed = await routeStrongIntent({
            from,
            to,
            body: rawText,
            eventId,
            providerMessageId,
            entryChannel: channel,
            target: strongDepartment,
          });
          if (routed) return routed;
        }
      }
    }

    if (!strongDepartment && text !== "HELP") {
      const continuation = await routeOwnedContinuation({
        from,
        to,
        body: rawText,
        eventId,
        providerMessageId,
        entryChannel: channel,
      });
      if (continuation) return continuation;
    }

    const conversationalText = canonicalizeNaturalSmsContinuation(rawText);

    if (channel === "concierge") {
      if (text === "HELP") {
        await sendConciergeSms({
          to: from,
          body: "TheOutHaven Concierge: just text naturally. I can help with outing ideas, locations, hours, directions, booking follow-ups, and review replies. Reply STOP to stop messages.",
        });
        return NextResponse.json({ received: true, action: "concierge_help" });
      }

      const consentResult = await processInternalReservationReviewConsentReply({
        from,
        body: conversationalText,
        providerMessageId,
      });
      if (consentResult.handled) {
        return NextResponse.json({
          received: true,
          action: consentResult.action || "concierge_review_consent_reply",
          review: consentResult,
        });
      }

      const reviewResult = await processSmsReviewReply({ from, body: conversationalText, eventId, providerMessageId });
      if (reviewResult.handled) return NextResponse.json({ received: true, action: reviewResult.action || "concierge_review_reply", review: reviewResult });

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

      await sendConciergeSms({
        to: from,
        body: "I’m not completely sure what you mean yet. Are you asking for outing ideas, information about a place, directions or hours, help with a booking, or something else? Tell me a little more and I’ll keep going.",
      });
      await supabaseAdmin.from("sms_logs").insert({
        customer_phone: from,
        message_type: "incoming_concierge_clarification",
        message_body: rawText,
        provider: "telnyx",
        provider_message_id: providerMessageId,
        status: "received",
        created_at: new Date().toISOString(),
        metadata: conciergeResult.error ? { edge_router_error: conciergeResult.error } : { routed_by: "concierge-router" },
      });
      return NextResponse.json({ received: true, action: "concierge_clarification_sent" });
    }

    if (channel === "support") {
      if (firstDelivery && text === "HELP") {
        await sendSupportSms({ to: from, body: "TheOutHaven Support: send your question or update naturally here and it will be added to your support conversation. Reply STOP to stop SMS replies." });
        return NextResponse.json({ received: true, action: "support_help" });
      }
      const supportRoute = await routeSupportFromSmsChannel({ from, to, body: rawText, eventId, providerMessageId });
      if (supportRoute?.ticketId) await activateSupportSmsOwnership({ ticketId: supportRoute.ticketId, entryNumber: to });
      return NextResponse.json({
        received: true,
        duplicate: supportRoute?.duplicate || !firstDelivery,
        action: "support_message_received",
        ticketId: supportRoute?.ticketId || null,
        messageId: supportRoute?.messageId || null,
        topicBoundary: Boolean(supportRoute?.topicBoundary),
      });
    }

    if (isCrmMainNumber) {
      const crmRoute = await routeInboundCrmSms({ from, to, body: rawText, eventId, providerMessageId });
      if (firstDelivery && text === "HELP") await sendCrmSms({ to: from, body: "TheOutHaven CRM: reply naturally with a question or update and we’ll keep it with your conversation. For support, just say what you need and I’ll route it. Reply STOP to stop CRM messages." });
      if (firstDelivery && text !== "HELP" && !crmRoute?.matched) {
        await sendCrmSms({
          to: from,
          body: "I received that, but I’m not sure which conversation or request it belongs to yet. Can you tell me what you’re following up about, the business or person involved, or what you need us to do next?",
        });
      }
      if (firstDelivery) {
        await supabaseAdmin.from("sms_logs").insert({
          location_id: crmRoute?.locationId || null,
          customer_phone: from,
          message_type: crmRoute?.matched ? "incoming_crm_message" : "incoming_crm_clarification",
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
        action: text === "HELP" ? "crm_help" : crmRoute?.matched ? "crm_message_received" : "crm_clarification_sent",
        routing: crmRoute?.matched ? "matched" : "unmatched",
        conversationId: crmRoute?.conversationId || null,
      });
    }

    if (channel === "marketing") {
      if (text === "HELP") {
        await sendMarketingSms({ to: from, body: "TheOutHaven Updates: reply naturally with a question or request. For reservations, support, or outing help, just say what you need and I’ll route it. Reply STOP to opt out." });
        return NextResponse.json({ received: true, action: "marketing_help_recorded" });
      }
      await supabaseAdmin.from("sms_logs").insert({
        customer_phone: from,
        message_type: "incoming_marketing_clarification",
        message_body: rawText,
        provider: "telnyx",
        provider_message_id: providerMessageId,
        status: "received",
        created_at: new Date().toISOString(),
      });
      await sendMarketingSms({
        to: from,
        body: "I got your reply, but I’m not sure what you need yet. Is this about a reservation, support issue, outing recommendation, or one of our updates? Tell me a little more and I’ll route it for you.",
      });
      return NextResponse.json({ received: true, action: "marketing_clarification_sent" });
    }

    if (channel === "reservations") {
      if (text === "HELP") {
        await sendReservationSms({ to: from, body: "TheOutHaven Reservations: just text naturally to reschedule, change date/time or guest count, report that you're running late, review details, or cancel. For example: “move it to 8,” “we’re running 10 minutes late,” “make it for 4,” or “cancel my reservation.” Reply STOP to stop SMS updates." });
        return NextResponse.json({ received: true, action: "reservation_help" });
      }

      const lateArrivalResult = await processReservationLateArrival({
        from,
        text: conversationalText,
        providerMessageId,
        eventId,
        to,
      });
      if (lateArrivalResult.handled) {
        await supabaseAdmin.from("sms_logs").insert({
          location_id: lateArrivalResult.locationId || null,
          reservation_id: lateArrivalResult.reservationId || null,
          customer_phone: from,
          message_type: `incoming_reservation_${lateArrivalResult.action || "late_arrival"}`,
          message_body: rawText,
          provider: "telnyx",
          provider_message_id: providerMessageId,
          status: "received",
          created_at: new Date().toISOString(),
        });
        return NextResponse.json({ received: true, ...lateArrivalResult });
      }

      const actionResult = await processReservationSmsAction({
        from,
        text: conversationalText,
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
          ? "I received your message, but I’m not sure what you want to do. You can reply CHANGE, CANCEL, DETAILS, tell me the new date/time/party size, or tell me if you’re running late."
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
