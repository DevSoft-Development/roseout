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
const RECENT_EXPLICIT_ROUTE_MS = 30 * 60 * 1000;

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
    if (metadata.sms_owner_active === false) continue;
    const storedReplyNumber = normalizePhone(String(metadata.reply_number || metadata.entry_number || ""));
    if (storedReplyNumber === entryNumber && String(metadata.handling_department || "support") === "support") {
      return {
        ticketId: String(ticket.id),
        status: String(ticket.status || ""),
        lastMessageAt: String(ticket.last_message_at || ""),
      };
    }

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
    if (normalizePhone(latestInbound.data?.to_address) === entryNumber) {
      return {
        ticketId: String(ticket.id),
        status: String(ticket.status || ""),
        lastMessageAt: String(ticket.last_message_at || latestInbound.data?.created_at || ""),
      };
    }
  }

  return null;
}

export async function releaseSupportSmsOwnership(params: { phone: string; entryNumber: string }) {
  const phone = normalizePhone(params.phone);
  const entryNumber = normalizePhone(params.entryNumber);
  if (!phone || !entryNumber) return;

  const tickets = await supabaseAdmin
    .from("support_tickets")
    .select("id,metadata")
    .eq("requester_phone", phone)
    .in("status", ACTIVE_SUPPORT_STATUSES)
    .order("last_message_at", { ascending: false })
    .limit(8);
  if (tickets.error) throw tickets.error;

  for (const ticket of tickets.data || []) {
    const metadata = (ticket.metadata || {}) as Record<string, unknown>;
    const replyNumber = normalizePhone(String(metadata.reply_number || metadata.entry_number || ""));
    if (replyNumber !== entryNumber || metadata.sms_owner_active === false) continue;
    await supabaseAdmin.from("support_tickets").update({
      metadata: {
        ...metadata,
        sms_owner_active: false,
        sms_owner_released_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }).eq("id", ticket.id);
  }
}

async function reservationConversationFor(phone: string, entryNumber: string) {
  const reservation = await findReservationForInboundSms(phone);
  if (!reservation) return null;

  const conversation = await supabaseAdmin
    .from("crm_conversations")
    .select("id,status,assigned_team,last_message_at,metadata")
    .eq("reservation_id", reservation.id)
    .eq("assigned_team", "reservations")
    .in("status", ACTIVE_RESERVATION_CONVERSATION_STATUSES)
    .is("archived_at", null)
    .maybeSingle();
  if (conversation.error) throw conversation.error;
  if (!conversation.data?.id) return null;

  const conversationMetadata = (conversation.data.metadata || {}) as Record<string, unknown>;
  const ownerNumber = normalizePhone(String(conversationMetadata.sms_owner_entry_number || ""));
  if (conversationMetadata.sms_owner_active === false && ownerNumber === entryNumber) return null;
  if (conversationMetadata.sms_owner_active === true && ownerNumber === entryNumber) {
    return {
      reservation,
      conversationId: String(conversation.data.id),
      lastMessageAt: String(conversation.data.last_message_at || conversationMetadata.sms_owner_updated_at || ""),
    };
  }

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
      return {
        reservation,
        conversationId: String(conversation.data.id),
        lastMessageAt: String(conversation.data.last_message_at || message.created_at || ""),
      };
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

export async function activateReservationSmsOwnership(params: { phone: string; entryNumber: string }) {
  const phone = normalizePhone(params.phone);
  const entryNumber = normalizePhone(params.entryNumber);
  if (!phone || !entryNumber) return null;
  const reservation = await findReservationForInboundSms(phone);
  if (!reservation) return null;

  const conversation = await supabaseAdmin
    .from("crm_conversations")
    .select("id,metadata")
    .eq("reservation_id", reservation.id)
    .eq("assigned_team", "reservations")
    .is("archived_at", null)
    .maybeSingle();
  if (conversation.error) throw conversation.error;
  if (!conversation.data?.id) return null;
  const metadata = (conversation.data.metadata || {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  await supabaseAdmin.from("crm_conversations").update({
    metadata: {
      ...metadata,
      sms_owner_active: true,
      sms_owner_department: "reservations",
      sms_owner_entry_number: entryNumber,
      sms_owner_updated_at: now,
    },
    updated_at: now,
  }).eq("id", conversation.data.id);
  return { reservationId: reservation.id, conversationId: String(conversation.data.id) };
}

export async function releaseReservationSmsOwnership(params: { phone: string; entryNumber: string }) {
  const phone = normalizePhone(params.phone);
  const entryNumber = normalizePhone(params.entryNumber);
  if (!phone || !entryNumber) return;
  const ownership = await reservationConversationFor(phone, entryNumber);
  if (!ownership) return;

  const conversation = await supabaseAdmin
    .from("crm_conversations")
    .select("metadata")
    .eq("id", ownership.conversationId)
    .maybeSingle();
  if (conversation.error) throw conversation.error;
  const metadata = (conversation.data?.metadata || {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  await supabaseAdmin.from("crm_conversations").update({
    metadata: {
      ...metadata,
      sms_owner_active: false,
      sms_owner_entry_number: entryNumber,
      sms_owner_released_at: now,
    },
    updated_at: now,
  }).eq("id", ownership.conversationId);
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
  await activateReservationSmsOwnership({ phone, entryNumber });

  return {
    handled: true,
    action: "reservation_handoff_continuation",
    reservationId: ownership.reservation.id,
    locationId: ownership.reservation.location_id,
    conversationId: ownership.conversationId,
  };
}

export async function findRecentExplicitSmsRouteOwnership(params: { phone: string; entryChannel: string }) {
  const phone = normalizePhone(params.phone);
  if (!phone || !params.entryChannel) return null;
  const cutoff = new Date(Date.now() - RECENT_EXPLICIT_ROUTE_MS).toISOString();
  const result = await supabaseAdmin
    .from("sms_logs")
    .select("message_type,metadata,created_at")
    .eq("customer_phone", phone)
    .like("message_type", "incoming_%_routed_%")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(12);
  if (result.error) throw result.error;

  for (const row of result.data || []) {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    if (String(metadata.entry_channel || "") !== params.entryChannel) continue;
    const department = String(metadata.handling_department || "");
    if (department === "concierge" || department === "support" || department === "reservations") {
      return { department, lastMessageAt: String(row.created_at || "") } as const;
    }
  }
  return null;
}

export async function clearReservationSmsSession(phoneValue: string) {
  const phone = normalizePhone(phoneValue);
  if (!phone) return;
  await supabaseAdmin.from("reservation_sms_sessions").delete().eq("phone_e164", phone);
}
