import crypto from "node:crypto";

import { getSupportAiDecision, supportAiCanRespond } from "@/lib/support/ai-responder";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone, sendSupportSms } from "@/lib/sms/telnyx";

export const SUPPORT_SMS_NUMBER = normalizePhone(
  process.env.TELNYX_SUPPORT_PHONE_NUMBER || "+15162000801",
);

const ACTIVE_SUPPORT_STATUSES = [
  "new",
  "open",
  "pending",
  "waiting_on_customer",
  "waiting_on_internal",
  "escalated",
  "reopened",
];

function ticketNumber() {
  return `TOH-SMS-${Date.now().toString(36).toUpperCase()}`;
}

async function findTicketFromSmsHistory(phone: string) {
  const { data: messages, error: messageError } = await supabaseAdmin
    .from("support_ticket_messages")
    .select("ticket_id,created_at")
    .eq("channel", "sms")
    .or(`author_phone.eq.${phone},from_address.eq.${phone},to_address.eq.${phone}`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (messageError) throw messageError;
  if (!messages?.length) return null;

  const ticketIds = [...new Set(messages.map((row) => row.ticket_id).filter(Boolean))];
  if (!ticketIds.length) return null;

  const { data: tickets, error: ticketError } = await supabaseAdmin
    .from("support_tickets")
    .select("id,status,ticket_number,requester_phone,public_access_token,source")
    .in("id", ticketIds)
    .in("status", ACTIVE_SUPPORT_STATUSES)
    .order("last_message_at", { ascending: false })
    .limit(1);

  if (ticketError) throw ticketError;
  return tickets?.[0] || null;
}

async function findTicketFromRequesterPhone(phone: string) {
  const { data, error } = await supabaseAdmin
    .from("support_tickets")
    .select("id,status,ticket_number,requester_phone,public_access_token,source")
    .eq("requester_phone", phone)
    .in("status", ACTIVE_SUPPORT_STATUSES)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function createSmsTicket(phone: string, body: string) {
  const now = new Date().toISOString();
  const publicAccessToken = crypto.randomBytes(24).toString("hex");
  const cleanBody = body.trim() || "SMS support request";
  const { data, error } = await supabaseAdmin
    .from("support_tickets")
    .insert({
      ticket_number: ticketNumber(),
      requester_name: phone,
      requester_phone: phone,
      requester_type: "user",
      subject: `SMS support: ${cleanBody.slice(0, 72)}`,
      description: cleanBody,
      topic: "General Support",
      category: "General Support",
      priority: "normal",
      status: "new",
      source: "sms",
      public_access_token: publicAccessToken,
      last_message_at: now,
      metadata: { first_channel: "sms", support_number: SUPPORT_SMS_NUMBER },
    })
    .select("id,status,ticket_number,requester_phone,public_access_token,source")
    .single();

  if (error || !data?.id) throw error || new Error("Unable to create SMS support ticket");
  return data;
}

async function recordOutboundSupportSms(params: {
  ticketId: string;
  to: string;
  body: string;
  providerMessageId: string | null;
  deliveryStatus: string;
  actorType: "admin" | "system";
  authorName: string;
  authorEmail?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin
    .from("support_ticket_messages")
    .insert({
      ticket_id: params.ticketId,
      actor_type: params.actorType,
      author_name: params.authorName,
      author_email: params.authorEmail || null,
      body: params.body,
      direction: "outbound",
      channel: "sms",
      provider: "telnyx",
      delivery_status: params.deliveryStatus || "queued",
      from_address: SUPPORT_SMS_NUMBER,
      to_address: params.to,
      provider_message_id: params.providerMessageId,
      metadata: params.metadata || {},
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function sendFallbackAcknowledgement(ticket: { id: string; ticket_number: string | null }, phone: string) {
  const body = `TheOutHaven Support: We received your message${ticket.ticket_number ? ` (${ticket.ticket_number})` : ""}. A support team member can reply to you here by text.`;
  try {
    const sent = await sendSupportSms({ to: phone, body });
    await recordOutboundSupportSms({
      ticketId: ticket.id,
      to: phone,
      body,
      providerMessageId: sent.id,
      deliveryStatus: sent.status,
      actorType: "system",
      authorName: "TheOutHaven Support",
      metadata: { automatic_acknowledgement: true, ai_fallback: true },
    });
  } catch (error) {
    console.error("Support SMS acknowledgement failed", error);
  }
}

async function addAiHandoffNote(ticketId: string, reason: string) {
  const { error } = await supabaseAdmin.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    actor_type: "system",
    author_name: "TheOutHaven Support AI",
    body: `AI handed this conversation to a human support agent. Reason: ${reason}`,
    direction: "internal",
    channel: "web",
    provider: "system",
    delivery_status: "recorded",
    internal_note: true,
    metadata: { ai_handoff: true, ai_handoff_reason: reason },
  });
  if (error) console.error("Support AI handoff note failed", error);
}

async function respondWithAi(ticket: { id: string; status: string | null }, phone: string, latestMessage: string) {
  if (ticket.status === "escalated") return false;

  let canRespond = false;
  try {
    canRespond = await supportAiCanRespond(ticket.id);
  } catch (error) {
    console.error("Support AI takeover check failed", error);
    return false;
  }
  if (!canRespond) return false;

  const decision = await getSupportAiDecision({ ticketId: ticket.id, latestMessage });
  if (decision.action === "silent") return false;

  try {
    const sent = await sendSupportSms({ to: phone, body: decision.message });
    await recordOutboundSupportSms({
      ticketId: ticket.id,
      to: phone,
      body: decision.message,
      providerMessageId: sent.id,
      deliveryStatus: sent.status,
      actorType: "system",
      authorName: "TheOutHaven Support AI",
      metadata: {
        ai_generated: true,
        ai_action: decision.action,
        ai_reason: decision.reason,
        ai_model: decision.model || null,
        ai_source_article_ids: decision.sourceArticleIds || [],
        ai_handoff: decision.action === "handoff",
      },
    });

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("support_tickets")
      .update({
        status: decision.action === "handoff" ? "escalated" : "waiting_on_customer",
        priority: decision.priority,
        category: decision.category,
        last_message_at: now,
        updated_at: now,
        first_response_at: now,
        ...(decision.action === "handoff" ? { escalated_at: now } : {}),
      })
      .eq("id", ticket.id);

    if (decision.action === "handoff") await addAiHandoffNote(ticket.id, decision.reason);
    return true;
  } catch (error) {
    console.error("Support AI SMS send failed", error);
    return false;
  }
}

export async function sendSupportTicketSmsReply(params: {
  ticketId: string;
  body: string;
  authorName: string;
  authorEmail?: string | null;
}) {
  const body = params.body.trim();
  if (!body) throw new Error("Reply message is required.");

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from("support_tickets")
    .select("id,status,source,requester_phone")
    .eq("id", params.ticketId)
    .maybeSingle();

  if (ticketError) throw ticketError;
  if (!ticket?.id || ticket.source !== "sms" || !ticket.requester_phone) return null;

  const to = normalizePhone(ticket.requester_phone);
  if (!to) throw new Error("SMS support ticket is missing a valid requester phone number.");

  const sent = await sendSupportSms({ to, body });
  const messageId = await recordOutboundSupportSms({
    ticketId: ticket.id,
    to,
    body,
    providerMessageId: sent.id,
    deliveryStatus: sent.status,
    actorType: "admin",
    authorName: params.authorName,
    authorEmail: params.authorEmail || null,
    metadata: { human_agent_reply: true },
  });

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("support_tickets")
    .update({
      status: ticket.status === "escalated" ? "escalated" : "waiting_on_customer",
      last_message_at: now,
      updated_at: now,
      first_response_at: now,
    })
    .eq("id", ticket.id)
    .is("first_response_at", null);

  await supabaseAdmin
    .from("support_tickets")
    .update({
      status: ticket.status === "escalated" ? "escalated" : "waiting_on_customer",
      last_message_at: now,
      updated_at: now,
    })
    .eq("id", ticket.id);

  return { ticketId: ticket.id as string, messageId, providerMessageId: sent.id, status: sent.status };
}

export async function routeInboundSupportSms(params: {
  from: string;
  to: string;
  body: string;
  eventId: string;
  providerMessageId: string | null;
}) {
  const from = normalizePhone(params.from);
  const to = normalizePhone(params.to);
  if (!from || to !== SUPPORT_SMS_NUMBER) return null;

  if (params.providerMessageId) {
    const { data: duplicate, error: duplicateError } = await supabaseAdmin
      .from("support_ticket_messages")
      .select("id,ticket_id")
      .eq("provider", "telnyx")
      .eq("provider_message_id", params.providerMessageId)
      .eq("direction", "inbound")
      .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicate?.id) {
      return { ticketId: duplicate.ticket_id as string, messageId: duplicate.id as string, duplicate: true };
    }
  }

  let ticket = await findTicketFromSmsHistory(from);
  if (!ticket) ticket = await findTicketFromRequesterPhone(from);
  const createdNewTicket = !ticket;
  if (!ticket) ticket = await createSmsTicket(from, params.body);
  const priorStatus = ticket.status;

  const now = new Date().toISOString();
  const { data: message, error: messageError } = await supabaseAdmin
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticket.id,
      actor_type: "creator",
      author_name: from,
      author_phone: from,
      body: params.body,
      direction: "inbound",
      channel: "sms",
      provider: "telnyx",
      delivery_status: "received",
      from_address: from,
      to_address: to,
      provider_message_id: params.providerMessageId,
      metadata: { telnyx_event_id: params.eventId },
    })
    .select("id")
    .single();

  if (messageError) {
    if (messageError.code === "23505" && params.providerMessageId) {
      const { data: existing } = await supabaseAdmin
        .from("support_ticket_messages")
        .select("id,ticket_id")
        .eq("provider", "telnyx")
        .eq("provider_message_id", params.providerMessageId)
        .eq("direction", "inbound")
        .maybeSingle();
      if (existing?.id) {
        return { ticketId: existing.ticket_id as string, messageId: existing.id as string, duplicate: true };
      }
    }
    throw messageError;
  }

  const nextStatus = priorStatus === "escalated" ? "escalated" : "open";
  await supabaseAdmin
    .from("support_tickets")
    .update({ status: nextStatus, last_message_at: now, updated_at: now })
    .eq("id", ticket.id);

  const aiHandled = await respondWithAi({ id: ticket.id, status: priorStatus }, from, params.body);
  if (!aiHandled && createdNewTicket) await sendFallbackAcknowledgement(ticket, from);

  return { ticketId: ticket.id as string, messageId: message.id as string, duplicate: false, aiHandled };
}
