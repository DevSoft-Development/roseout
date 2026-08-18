import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone } from "@/lib/sms/telnyx";

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
    .select("id,status,ticket_number,requester_phone,public_access_token")
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
    .select("id,status,ticket_number,requester_phone,public_access_token")
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
  const { data, error } = await supabaseAdmin
    .from("support_tickets")
    .insert({
      ticket_number: ticketNumber(),
      requester_name: phone,
      requester_phone: phone,
      requester_type: "user",
      subject: `SMS support: ${body.slice(0, 72) || "Support request"}`,
      category: "General Support",
      priority: "normal",
      status: "new",
      source: "sms",
      public_access_token: publicAccessToken,
      last_message_at: now,
      metadata: { first_channel: "sms", support_number: SUPPORT_SMS_NUMBER },
    })
    .select("id,status,ticket_number,requester_phone,public_access_token")
    .single();

  if (error || !data?.id) throw error || new Error("Unable to create SMS support ticket");
  return data;
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
  if (!ticket) ticket = await createSmsTicket(from, params.body);

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

  const nextStatus = ticket.status === "escalated" ? "escalated" : "open";
  await supabaseAdmin
    .from("support_tickets")
    .update({ status: nextStatus, last_message_at: now, updated_at: now })
    .eq("id", ticket.id);

  return { ticketId: ticket.id as string, messageId: message.id as string, duplicate: false };
}
