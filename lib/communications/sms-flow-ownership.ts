import "server-only";

import { appendReservationMessage, findReservationForInboundSms } from "@/lib/communications/reservation-thread";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone, purposeForTelnyxNumber } from "@/lib/sms/telnyx";

const ACTIVE_SUPPORT_STATUSES = [
  "new",
  "open",
  "pending",
  "waiting_on_customer",
  "waiting_on_internal",
  "escalated",
  "reopened",
];

const ACTIVE_RESERVATION_CONVERSATION_STATUSES = ["open", "waiting_on_team", "waiting_on_customer"];

export async function findActiveSupportSmsOwnership(params: {
  phone: string;
  entryNumber: string;
}) {
  const phone = normalizePhone(params.phone);
  const entryNumber = normalizePhone(params.entryNumber);
  if (!phone || !entryNumber) return null;

  const tickets = await supabaseAdmin
    .from("support_tickets")
    .select("id,status,last_message_at,metadata")
    .eq("requester_phone", phone)
    .in("status", ACTIVE_SUPPORT_STATUSES)
    .order("last_message_at", { ascending: false })
    .limit(8);
  if (tickets.error) throw tickets.error;

  for (const ticket of tickets.data || []) {
    const metadata = (ticket.metadata || {}) as Record<string, unknown>;
    const storedReplyNumber = normalizePhone(String(metadata.reply_number || metadata.entry_number || ""));
    if (storedReplyNumber === entryNumber && String(metadata.handling_department || "support") === "support") {
      return { ticketId: String(ticket.id), status: String(ticket.status || "") };
    }

    const latestInbound = await supabaseAdmin
      .from("support_ticket_messages")
      .select("to_address")
      .eq("ticket_id", ticket.id)
      .eq("direction", "inbound")
      .eq("channel", "sms")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestInbound.error) throw latestInbound.error;
    if (normalizePhone(latestInbound.data?.to_address) === entryNumber) {
      return { ticketId: String(ticket.id), status: String(ticket.status || "") };
    }
  }

  return null;
}

async function reservationConversationFor(phone: string, entryNumber: string) {
  const reservation = await findReservationForInboundSms(phone);
  if (!reservation) return null;

  const conversation = await supabaseAdmin
    .from("crm_conversations")
    .select("id,status,assigned_team,last_message_at")
    .eq("reservation_id", reservation.id)
    .eq("assigned_team", "reservations")
    .in("status", ACTIVE_RESERVATION_CONVERSATION_STATUSES)
    .is("archived_at", null)
    .maybeSingle();
  if (conversation.error) throw conversation.error;
  if (!conversation.data?.id) return null;

  const latestMessages = await supabaseAdmin
    .from("crm_messages")
    .select("id,direction,channel,metadata,created_at")
    .eq("conversation_id", conversation.data.id)
    .eq("channel", "sms")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(8);
  if (latestMessages.error) throw latestMessages.error;

  for (const message of latestMessages.data || []) {
    const metadata = (message.metadata || {}) as Record<string, unknown>;
    const replyNumber = normalizePhone(String(metadata.entry_number || metadata.reply_number || metadata.to || ""));
    if (replyNumber === entryNumber) {
      return { reservation, conversationId: String(conversation.data.id) };
    }
  }

  return null;
}

export async function findActiveReservationSmsOwnership(params: {
  phone: string;
  entryNumber: string;
}) {
  const phone = normalizePhone(params.phone);
  const entryNumber = normalizePhone(params.entryNumber);
  if (!phone || !entryNumber) return null;
  return reservationConversationFor(phone, entryNumber);
}

export async function appendReservationSmsContinuation(params: {
  phone: string;
  entryNumber: string;
  body: string;
  eventId: string;
  providerMessageId: string | null;
}) {
  const phone = normalizePhone(params.phone);
  const entryNumber = normalizePhone(params.entryNumber);
  if (!phone || !entryNumber) return null;

  const ownership = await reservationConversationFor(phone, entryNumber);
  if (!ownership) return null;
  const entryChannel = purposeForTelnyxNumber(entryNumber) || "sms";

  await appendReservationMessage({
    reservation: ownership.reservation,
    direction: "inbound",
    channel: "sms",
    body: params.body,
    provider: "telnyx",
    providerMessageId: params.providerMessageId,
    sourceRecordId: `telnyx-event:${params.eventId}`,
    recipientAddress: phone,
    metadata: {
      telnyx_event_id: params.eventId,
      to: entryNumber,
      entry_number: entryNumber,
      entry_channel: entryChannel,
      handling_department: "reservations",
      cross_channel_handoff: entryChannel !== "reservations",
      continuation: true,
    },
  });

  return {
    handled: true,
    action: "reservation_handoff_continuation",
    reservationId: ownership.reservation.id,
    locationId: ownership.reservation.location_id,
    conversationId: ownership.conversationId,
  };
}

export async function clearReservationSmsSession(phoneValue: string) {
  const phone = normalizePhone(phoneValue);
  if (!phone) return;
  await supabaseAdmin.from("reservation_sms_sessions").delete().eq("phone_e164", phone);
}
