import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone } from "@/lib/sms/telnyx";

type ReservationLike = {
  id: string;
  location_id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  reservation_date?: string | null;
  reservation_time?: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function reservationConversationKey(reservationId: string) {
  return `reservation:${reservationId}`;
}

export function reservationReplyTo(reservationId: string) {
  const domain = clean(process.env.RESERVATION_REPLY_DOMAIN);
  return domain ? `reserve+${reservationId}@${domain}` : undefined;
}

export function reservationIdFromReplyAddress(address: string) {
  const match = clean(address).toLowerCase().match(/reserve\+([0-9a-f-]{36})@/i);
  return match?.[1] || "";
}

export async function ensureReservationConversation(reservation: ReservationLike) {
  const key = reservationConversationKey(reservation.id);
  const existing = await supabaseAdmin
    .from("crm_conversations")
    .select("*")
    .eq("conversation_key", key)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const now = new Date().toISOString();
  const created = await supabaseAdmin
    .from("crm_conversations")
    .insert({
      conversation_key: key,
      channel: "support",
      status: "open",
      subject: `Reservation conversation${reservation.customer_name ? ` · ${reservation.customer_name}` : ""}`,
      location_id: reservation.location_id,
      reservation_id: reservation.id,
      assigned_team: "reservations",
      priority: "normal",
      is_unread: false,
      unread_count: 0,
      metadata: {
        context_type: "reservation",
        reservation_id: reservation.id,
        customer_email: reservation.customer_email || null,
        customer_phone: reservation.customer_phone || null,
      },
      updated_at: now,
    })
    .select("*")
    .single();
  if (created.error) {
    // Parallel first messages can race on conversation_key. Re-read once.
    const retry = await supabaseAdmin.from("crm_conversations").select("*").eq("conversation_key", key).maybeSingle();
    if (retry.error || !retry.data) throw created.error;
    return retry.data;
  }
  return created.data;
}

export async function appendReservationMessage(params: {
  reservation: ReservationLike;
  direction: "inbound" | "outbound" | "system";
  channel: "sms" | "email" | "system";
  body: string;
  subject?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  providerThreadId?: string | null;
  senderUserId?: string | null;
  sourceRecordId?: string | null;
  recipientAddress?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const conversation = await ensureReservationConversation(params.reservation);
  const now = new Date().toISOString();
  const insert = await supabaseAdmin
    .from("crm_messages")
    .insert({
      conversation_id: conversation.id,
      direction: params.direction,
      channel: params.channel,
      message_type: params.direction === "inbound" ? "reply" : "reservation_message",
      sender_user_id: params.senderUserId || null,
      subject: params.subject || null,
      body_text: params.body,
      provider: params.provider || null,
      provider_message_id: params.providerMessageId || null,
      provider_thread_id: params.providerThreadId || null,
      status: params.direction === "inbound" ? "delivered" : "sent",
      sent_at: params.direction === "outbound" ? now : null,
      delivered_at: params.direction === "inbound" ? now : null,
      source_system: "reservation",
      source_record_id: params.sourceRecordId || null,
      metadata: { reservation_id: params.reservation.id, location_id: params.reservation.location_id, ...(params.metadata || {}) },
      updated_at: now,
    })
    .select("*")
    .single();

  if (insert.error) {
    if (insert.error.code === "23505" && (params.providerMessageId || params.sourceRecordId)) return null;
    throw insert.error;
  }

  if (params.recipientAddress) {
    await supabaseAdmin.from("crm_message_recipients").insert({
      message_id: insert.data.id,
      recipient_type: params.channel === "sms" ? "sms" : "to",
      address: params.recipientAddress,
      delivery_status: params.direction === "inbound" ? "received" : "sent",
    });
  }

  const inbound = params.direction === "inbound";
  await supabaseAdmin
    .from("crm_conversations")
    .update({
      last_message_at: now,
      last_inbound_at: inbound ? now : conversation.last_inbound_at,
      last_outbound_at: !inbound && params.direction === "outbound" ? now : conversation.last_outbound_at,
      status: inbound ? "waiting_on_team" : "waiting_on_customer",
      is_unread: inbound,
      unread_count: inbound ? Number(conversation.unread_count || 0) + 1 : Number(conversation.unread_count || 0),
      updated_at: now,
    })
    .eq("id", conversation.id);

  return insert.data;
}

export async function getReservationThread(reservationId: string, locationId: string, markRead = false) {
  const conversation = await supabaseAdmin
    .from("crm_conversations")
    .select("*")
    .eq("reservation_id", reservationId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (conversation.error) throw conversation.error;
  if (!conversation.data) return { conversation: null, messages: [] };

  const messages = await supabaseAdmin
    .from("crm_messages")
    .select("id,direction,channel,message_type,subject,body_text,provider,status,sent_at,delivered_at,created_at,metadata")
    .eq("conversation_id", conversation.data.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (messages.error) throw messages.error;

  if (markRead && conversation.data.is_unread) {
    await supabaseAdmin
      .from("crm_conversations")
      .update({ is_unread: false, unread_count: 0, updated_at: new Date().toISOString() })
      .eq("id", conversation.data.id);
    conversation.data.is_unread = false;
    conversation.data.unread_count = 0;
  }
  return { conversation: conversation.data, messages: messages.data || [] };
}

export async function getLocationReservationConversationSummary(locationId: string) {
  const result = await supabaseAdmin
    .from("crm_conversations")
    .select("reservation_id,is_unread,unread_count,last_message_at,last_inbound_at,status")
    .eq("location_id", locationId)
    .not("reservation_id", "is", null)
    .is("archived_at", null)
    .limit(500);
  if (result.error) throw result.error;
  return result.data || [];
}

export async function findReservationForInboundSms(phoneInput: string) {
  const phone = normalizePhone(phoneInput);
  if (!phone) return null;
  const today = new Date().toISOString().slice(0, 10);
  const result = await supabaseAdmin
    .from("location_reservations")
    .select("id,location_id,customer_name,customer_email,customer_phone,reservation_date,reservation_time,status")
    .eq("customer_phone", phone)
    .gte("reservation_date", today)
    .in("status", ["pending", "confirmed", "checked_in", "waiting", "arrived", "seated"])
    .order("reservation_date", { ascending: true })
    .order("reservation_time", { ascending: true })
    .limit(3);
  if (result.error) throw result.error;
  return result.data?.length === 1 ? result.data[0] : null;
}

export async function findReservationForInboundEmail(params: { from: string; to: string[] }) {
  for (const address of params.to) {
    const id = reservationIdFromReplyAddress(address);
    if (!id) continue;
    const exact = await supabaseAdmin
      .from("location_reservations")
      .select("id,location_id,customer_name,customer_email,customer_phone,reservation_date,reservation_time,status")
      .eq("id", id)
      .maybeSingle();
    if (exact.error) throw exact.error;
    if (exact.data && clean(exact.data.customer_email).toLowerCase() === clean(params.from).toLowerCase()) return exact.data;
  }

  const today = new Date().toISOString().slice(0, 10);
  const fallback = await supabaseAdmin
    .from("location_reservations")
    .select("id,location_id,customer_name,customer_email,customer_phone,reservation_date,reservation_time,status")
    .ilike("customer_email", clean(params.from))
    .gte("reservation_date", today)
    .in("status", ["pending", "confirmed", "checked_in", "waiting", "arrived", "seated"])
    .order("reservation_date", { ascending: true })
    .order("reservation_time", { ascending: true })
    .limit(3);
  if (fallback.error) throw fallback.error;
  return fallback.data?.length === 1 ? fallback.data[0] : null;
}
