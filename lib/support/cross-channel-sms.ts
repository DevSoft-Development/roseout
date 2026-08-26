import crypto from "node:crypto";

import { getSupportAiDecision, supportAiCanRespond } from "@/lib/support/ai-responder";
import { compactSmsMessage, getSupportToolDecision } from "@/lib/support/tool-layer";
import { didSupportTopicChange, inferExplicitSupportTopic, inferSupportCategory } from "@/lib/support/topic-context";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone, purposeForTelnyxNumber, sendTelnyxSmsFromNumber, TELNYX_CHANNEL_NUMBERS } from "@/lib/sms/telnyx";

const ACTIVE_STATUSES = ["new", "open", "pending", "waiting_on_customer", "waiting_on_internal", "escalated", "reopened"];
const REOPENABLE_STATUSES = [...ACTIVE_STATUSES, "resolved", "closed"];
const RECENT_CLOSED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type Ticket = {
  id: string;
  status: string | null;
  ticket_number: string | null;
  requester_phone: string | null;
  source: string | null;
  last_message_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function ticketNumber() {
  return `TOH-SMS-${Date.now().toString(36).toUpperCase()}`;
}

function reusable(ticket: Ticket) {
  if (ACTIVE_STATUSES.includes(String(ticket.status))) return true;
  if (ticket.status === "resolved") return true;
  if (ticket.status !== "closed") return false;
  const anchor = new Date(String(ticket.closed_at || ticket.last_message_at || "")).getTime();
  return Number.isFinite(anchor) && Date.now() - anchor <= RECENT_CLOSED_WINDOW_MS;
}

function entryChannel(entryNumber: string) {
  return purposeForTelnyxNumber(entryNumber) || "sms";
}

async function findTicket(phone: string) {
  const result = await supabaseAdmin
    .from("support_tickets")
    .select("id,status,ticket_number,requester_phone,source,last_message_at,resolved_at,closed_at,metadata")
    .eq("requester_phone", phone)
    .in("status", REOPENABLE_STATUSES)
    .order("last_message_at", { ascending: false })
    .limit(10);
  if (result.error) throw result.error;
  return ((result.data || []) as Ticket[]).find(reusable) || null;
}

async function priorInboundBodies(ticketId: string) {
  const result = await supabaseAdmin
    .from("support_ticket_messages")
    .select("body")
    .eq("ticket_id", ticketId)
    .eq("direction", "inbound")
    .or("internal_note.is.null,internal_note.eq.false")
    .order("created_at", { ascending: true })
    .limit(24);
  if (result.error) throw result.error;
  return (result.data || []).map((row) => String(row.body || "").trim()).filter(Boolean);
}

async function shouldRotateTicket(ticket: Ticket, latestMessage: string) {
  const latestTopic = inferExplicitSupportTopic(latestMessage);
  if (!latestTopic) return false;
  const prior = await priorInboundBodies(ticket.id);
  if (didSupportTopicChange(prior, latestMessage)) return true;
  const metadataTopic = String(ticket.metadata?.support_topic || "").trim();
  return Boolean(!prior.length && metadataTopic && metadataTopic !== latestTopic);
}

async function createTicket(phone: string, body: string, entryNumber: string) {
  const now = new Date().toISOString();
  const cleanBody = body.trim() || "SMS support request";
  const supportTopic = inferExplicitSupportTopic(cleanBody);
  const category = inferSupportCategory(cleanBody);
  const result = await supabaseAdmin
    .from("support_tickets")
    .insert({
      ticket_number: ticketNumber(),
      requester_name: phone,
      requester_phone: phone,
      requester_type: "user",
      subject: `SMS support: ${cleanBody.slice(0, 72)}`,
      description: cleanBody,
      topic: category,
      category,
      priority: "normal",
      status: "new",
      source: "sms",
      public_access_token: crypto.randomBytes(24).toString("hex"),
      last_message_at: now,
      metadata: {
        first_channel: "sms",
        entry_channel: entryChannel(entryNumber),
        entry_number: entryNumber,
        handling_department: "support",
        reply_number: entryNumber,
        support_topic: supportTopic,
      },
    })
    .select("id,status,ticket_number,requester_phone,source,last_message_at,resolved_at,closed_at,metadata")
    .single();
  if (result.error || !result.data?.id) throw result.error || new Error("Unable to create support ticket");
  return result.data as Ticket;
}

async function recordOutbound(params: {
  ticketId: string;
  phone: string;
  fromNumber: string;
  body: string;
  actorType: "system" | "admin";
  authorName: string;
  authorEmail?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const sent = await sendTelnyxSmsFromNumber({ to: params.phone, body: params.body, fromNumber: params.fromNumber });
  const inserted = await supabaseAdmin.from("support_ticket_messages").insert({
    ticket_id: params.ticketId,
    actor_type: params.actorType,
    author_name: params.authorName,
    author_email: params.authorEmail || null,
    body: params.body,
    direction: "outbound",
    channel: "sms",
    provider: "telnyx",
    delivery_status: sent.status || "queued",
    from_address: params.fromNumber,
    to_address: params.phone,
    provider_message_id: sent.id,
    metadata: params.metadata || {},
  }).select("id").single();
  if (inserted.error) throw inserted.error;
  return { messageId: inserted.data.id as string, providerMessageId: sent.id, status: sent.status };
}

async function addHandoffNote(ticketId: string, reason: string, entryNumber: string) {
  await supabaseAdmin.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    actor_type: "system",
    author_name: "TheOutHaven Support AI",
    body: `AI handed this conversation to a human support agent. Reason: ${reason}`,
    direction: "internal",
    channel: "web",
    provider: "system",
    delivery_status: "recorded",
    internal_note: true,
    metadata: { ai_handoff: true, ai_handoff_reason: reason, entry_number: entryNumber },
  });
}

async function tryAi(ticket: Ticket, phone: string, body: string, entryNumber: string) {
  if (ticket.status === "escalated") return false;
  if (!(await supportAiCanRespond(ticket.id))) return false;

  let toolDecision = null;
  try {
    toolDecision = await getSupportToolDecision({ ticketId: ticket.id, latestMessage: body });
  } catch (error) {
    console.error("Cross-channel support tool decision failed", error);
  }
  const decision = toolDecision || await getSupportAiDecision({ ticketId: ticket.id, latestMessage: body });
  if ((decision as any).action === "silent") return false;

  const action = (decision as any).action === "handoff" ? "handoff" : "reply";
  const resolved = Boolean((decision as any).resolved);
  const message = compactSmsMessage(String(decision.message || ""));
  if (!message) return false;

  await recordOutbound({
    ticketId: ticket.id,
    phone,
    fromNumber: entryNumber,
    body: message,
    actorType: "system",
    authorName: toolDecision ? "TheOutHaven Support" : "TheOutHaven Support AI",
    metadata: {
      ai_generated: !toolDecision,
      ai_action: action,
      ai_reason: decision.reason,
      ai_model: (decision as any).model || null,
      ai_source_article_ids: (decision as any).sourceArticleIds || [],
      ai_handoff: action === "handoff",
      support_tool: toolDecision ? (toolDecision.metadata?.support_tool || true) : null,
      support_tool_metadata: toolDecision?.metadata || null,
      entry_number: entryNumber,
      handling_department: "support",
    },
  });

  const now = new Date().toISOString();
  const supportTopic = inferExplicitSupportTopic(body);
  const update: Record<string, unknown> = {
    status: action === "handoff" ? "escalated" : resolved ? "resolved" : "waiting_on_customer",
    priority: decision.priority,
    category: decision.category,
    topic: decision.category,
    last_message_at: now,
    updated_at: now,
    metadata: {
      ...(ticket.metadata || {}),
      entry_channel: entryChannel(entryNumber),
      entry_number: entryNumber,
      reply_number: entryNumber,
      handling_department: "support",
      ...(supportTopic ? { support_topic: supportTopic } : {}),
    },
  };
  if ((decision as any).subject) update.subject = String((decision as any).subject).slice(0, 160);
  if (action === "handoff") update.escalated_at = now;
  if (resolved) update.resolved_at = now;
  await supabaseAdmin.from("support_tickets").update(update).eq("id", ticket.id);
  await supabaseAdmin.from("support_tickets").update({ first_response_at: now }).eq("id", ticket.id).is("first_response_at", null);
  if (action === "handoff") await addHandoffNote(ticket.id, decision.reason, entryNumber);
  return true;
}

export async function routeSupportFromSmsChannel(params: {
  from: string;
  to: string;
  body: string;
  eventId: string;
  providerMessageId: string | null;
}) {
  const phone = normalizePhone(params.from);
  const entryNumber = normalizePhone(params.to);
  if (!phone || !entryNumber) return null;

  if (params.providerMessageId) {
    const duplicate = await supabaseAdmin
      .from("support_ticket_messages")
      .select("id,ticket_id")
      .eq("provider", "telnyx")
      .eq("provider_message_id", params.providerMessageId)
      .eq("direction", "inbound")
      .maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data?.id) return { ticketId: duplicate.data.ticket_id as string, messageId: duplicate.data.id as string, duplicate: true };
  }

  let ticket = await findTicket(phone);
  const rotatedFromTicketId = ticket && await shouldRotateTicket(ticket, params.body) ? ticket.id : null;
  if (rotatedFromTicketId) ticket = null;
  const created = !ticket;
  if (!ticket) ticket = await createTicket(phone, params.body, entryNumber);
  const priorStatus = ticket.status;
  const reopened = priorStatus === "resolved" || priorStatus === "closed";
  const supportTopic = inferExplicitSupportTopic(params.body);

  const inbound = await supabaseAdmin.from("support_ticket_messages").insert({
    ticket_id: ticket.id,
    actor_type: "creator",
    author_name: phone,
    author_phone: phone,
    body: params.body,
    direction: "inbound",
    channel: "sms",
    provider: "telnyx",
    delivery_status: "received",
    from_address: phone,
    to_address: entryNumber,
    provider_message_id: params.providerMessageId,
    metadata: {
      telnyx_event_id: params.eventId,
      entry_number: entryNumber,
      entry_channel: entryChannel(entryNumber),
      handling_department: "support",
      support_topic: supportTopic,
      topic_boundary: Boolean(rotatedFromTicketId),
      previous_ticket_id: rotatedFromTicketId,
    },
  }).select("id").single();
  if (inbound.error) throw inbound.error;

  const now = new Date().toISOString();
  await supabaseAdmin.from("support_tickets").update({
    status: priorStatus === "escalated" ? "escalated" : reopened ? "reopened" : "open",
    last_message_at: now,
    updated_at: now,
    metadata: {
      ...(ticket.metadata || {}),
      entry_channel: entryChannel(entryNumber),
      entry_number: entryNumber,
      reply_number: entryNumber,
      handling_department: "support",
      ...(supportTopic ? { support_topic: supportTopic } : {}),
      ...(rotatedFromTicketId ? { previous_ticket_id: rotatedFromTicketId, topic_boundary: true } : {}),
    },
    ...(reopened ? { reopened_at: now, resolved_at: null, closed_at: null } : {}),
  }).eq("id", ticket.id);

  const aiHandled = await tryAi(ticket, phone, params.body, entryNumber);
  if (!aiHandled && (created || reopened)) {
    const message = reopened
      ? `TheOutHaven Support: Your ticket${ticket.ticket_number ? ` ${ticket.ticket_number}` : ""} has been reopened. You can keep texting here and the support team will see your messages.`
      : `TheOutHaven Support: We received your message${ticket.ticket_number ? ` (${ticket.ticket_number})` : ""}. A support team member can reply to you here by text.`;
    await recordOutbound({
      ticketId: ticket.id,
      phone,
      fromNumber: entryNumber,
      body: message,
      actorType: "system",
      authorName: "TheOutHaven Support",
      metadata: {
        automatic_acknowledgement: true,
        cross_channel_handoff: entryNumber !== TELNYX_CHANNEL_NUMBERS.support,
        entry_number: entryNumber,
        topic_boundary: Boolean(rotatedFromTicketId),
      },
    });
  }

  return {
    ticketId: ticket.id,
    messageId: inbound.data.id as string,
    duplicate: false,
    aiHandled,
    reopened,
    topicBoundary: Boolean(rotatedFromTicketId),
    previousTicketId: rotatedFromTicketId,
  };
}

export async function sendSupportTicketReplyOnEntryChannel(params: {
  ticketId: string;
  body: string;
  authorName: string;
  authorEmail?: string | null;
}) {
  const body = params.body.trim();
  if (!body) throw new Error("Reply message is required.");

  const ticketResult = await supabaseAdmin
    .from("support_tickets")
    .select("id,status,source,requester_phone,metadata")
    .eq("id", params.ticketId)
    .maybeSingle();
  if (ticketResult.error) throw ticketResult.error;
  const ticket = ticketResult.data as Ticket | null;
  if (!ticket?.id || ticket.source !== "sms" || !ticket.requester_phone) return null;

  const latestInbound = await supabaseAdmin
    .from("support_ticket_messages")
    .select("to_address,created_at")
    .eq("ticket_id", ticket.id)
    .eq("direction", "inbound")
    .eq("channel", "sms")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestInbound.error) throw latestInbound.error;

  const phone = normalizePhone(ticket.requester_phone);
  const fromNumber = normalizePhone(latestInbound.data?.to_address || String(ticket.metadata?.reply_number || "") || TELNYX_CHANNEL_NUMBERS.support);
  if (!phone) throw new Error("SMS support ticket is missing a valid requester phone number.");

  const sent = await recordOutbound({
    ticketId: ticket.id,
    phone,
    fromNumber,
    body,
    actorType: "admin",
    authorName: params.authorName,
    authorEmail: params.authorEmail || null,
    metadata: { human_agent_reply: true, entry_number: fromNumber, cross_channel_handoff: fromNumber !== TELNYX_CHANNEL_NUMBERS.support },
  });

  const now = new Date().toISOString();
  const status = ticket.status === "escalated" ? "escalated" : "waiting_on_customer";
  await supabaseAdmin.from("support_tickets").update({ status, last_message_at: now, updated_at: now, first_response_at: now }).eq("id", ticket.id).is("first_response_at", null);
  await supabaseAdmin.from("support_tickets").update({ status, last_message_at: now, updated_at: now }).eq("id", ticket.id);
  return { ticketId: ticket.id, ...sent };
}
