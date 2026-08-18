"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_READ_ROLES, CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

function phoneFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const phone = String((metadata as Record<string, unknown>).inbound_phone || "").trim();
  return phone || null;
}

function contactName(contact: { full_name?: string | null; first_name?: string | null; last_name?: string | null }, fallback: string) {
  return String(contact.full_name || "").trim() || [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || fallback;
}

export async function markUnmatchedCrmSmsRead(conversationId: string) {
  const actor = await requireAdminRole(CRM_READ_ROLES);
  const now = new Date().toISOString();

  const { error: conversationError } = await supabaseAdmin
    .from("crm_conversations")
    .update({ is_unread: false, unread_count: 0, updated_at: now })
    .eq("id", conversationId)
    .eq("channel", "sms")
    .contains("metadata", { routing_status: "unmatched" });

  if (conversationError) throw conversationError;

  const { error: notificationError } = await supabaseAdmin
    .from("crm_message_notifications")
    .update({ read_at: now, read_by: actor.user_id })
    .eq("conversation_id", conversationId)
    .is("read_at", null)
    .is("dismissed_at", null);

  if (notificationError) throw notificationError;

  revalidatePath("/admin/dashboard/crm/communications/unmatched");
  revalidatePath("/admin/dashboard/crm/notifications");
}

export async function matchUnmatchedCrmSmsConversation(conversationId: string, contactId: string) {
  await requireAdminRole(CRM_WRITE_ROLES);

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("crm_conversations")
    .select("id,conversation_key,metadata,unread_count,is_unread,last_message_at,last_inbound_at")
    .eq("id", conversationId)
    .eq("channel", "sms")
    .contains("metadata", { routing_status: "unmatched" })
    .single();

  if (conversationError) throw conversationError;

  const phone = phoneFromMetadata(conversation.metadata);
  if (!phone) throw new Error("Unmatched CRM SMS conversation has no sender phone number.");

  const { data: contact, error: contactError } = await supabaseAdmin
    .from("crm_contacts")
    .select("id,phone_e164,full_name,first_name,last_name")
    .eq("id", contactId)
    .is("archived_at", null)
    .single();

  if (contactError) throw contactError;
  if (contact.phone_e164 !== phone) throw new Error("CRM contact phone does not match the unmatched SMS sender.");

  const { data: accountLinks, error: accountError } = await supabaseAdmin
    .from("crm_account_contacts")
    .select("account_id,is_primary")
    .eq("contact_id", contact.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(10);

  if (accountError) throw accountError;

  const accountId = accountLinks?.[0]?.account_id || null;
  let locationId: string | null = null;

  if (accountId) {
    const { data: locationLink, error: locationError } = await supabaseAdmin
      .from("crm_account_locations")
      .select("location_id,is_primary_location")
      .eq("account_id", accountId)
      .eq("status", "active")
      .order("is_primary_location", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (locationError) throw locationError;
    locationId = locationLink?.location_id || null;
  }

  const targetKey = locationId ? `sms:${locationId}:${phone}` : `sms:contact:${contact.id}:${phone}`;
  const actionHref = locationId
    ? `/admin/dashboard/crm/${locationId}?tab=communications`
    : `/admin/dashboard/crm/contacts?phone=${encodeURIComponent(phone)}`;
  const now = new Date().toISOString();
  const name = contactName(contact, phone);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("crm_conversations")
    .select("id,unread_count,is_unread,last_message_at,last_inbound_at")
    .eq("conversation_key", targetKey)
    .is("archived_at", null)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id && existing.id !== conversationId) {
    const { error: messageMoveError } = await supabaseAdmin
      .from("crm_messages")
      .update({ conversation_id: existing.id })
      .eq("conversation_id", conversationId);
    if (messageMoveError) throw messageMoveError;

    const { error: notificationMoveError } = await supabaseAdmin
      .from("crm_message_notifications")
      .update({
        conversation_id: existing.id,
        contact_id: contact.id,
        location_id: locationId,
        notification_type: "inbound_sms",
        routing_status: "matched",
        title: `New SMS from ${name}`,
        action_href: actionHref,
      })
      .eq("conversation_id", conversationId);
    if (notificationMoveError) throw notificationMoveError;

    const latestMessageAt = [existing.last_message_at, conversation.last_message_at].filter(Boolean).sort().at(-1) || now;
    const latestInboundAt = [existing.last_inbound_at, conversation.last_inbound_at].filter(Boolean).sort().at(-1) || now;

    const { error: targetUpdateError } = await supabaseAdmin
      .from("crm_conversations")
      .update({
        account_id: accountId,
        contact_id: contact.id,
        location_id: locationId,
        status: "waiting_on_team",
        is_unread: Boolean(existing.is_unread || conversation.is_unread),
        unread_count: Number(existing.unread_count || 0) + Number(conversation.unread_count || 0),
        last_message_at: latestMessageAt,
        last_inbound_at: latestInboundAt,
        updated_at: now,
      })
      .eq("id", existing.id);
    if (targetUpdateError) throw targetUpdateError;

    const { error: sourceArchiveError } = await supabaseAdmin
      .from("crm_conversations")
      .update({ status: "archived", archived_at: now, is_unread: false, unread_count: 0, updated_at: now })
      .eq("id", conversationId);
    if (sourceArchiveError) throw sourceArchiveError;
  } else {
    const { error: updateError } = await supabaseAdmin
      .from("crm_conversations")
      .update({
        conversation_key: targetKey,
        account_id: accountId,
        contact_id: contact.id,
        location_id: locationId,
        priority: "normal",
        metadata: {
          ...(conversation.metadata && typeof conversation.metadata === "object" ? conversation.metadata : {}),
          routing_status: "matched",
          contact_id: contact.id,
          account_id: accountId,
          inbound_phone: phone,
        },
        updated_at: now,
      })
      .eq("id", conversationId);
    if (updateError) throw updateError;

    const { error: notificationError } = await supabaseAdmin
      .from("crm_message_notifications")
      .update({
        contact_id: contact.id,
        location_id: locationId,
        notification_type: "inbound_sms",
        routing_status: "matched",
        title: `New SMS from ${name}`,
        action_href: actionHref,
      })
      .eq("conversation_id", conversationId);
    if (notificationError) throw notificationError;
  }

  revalidatePath("/admin/dashboard/crm/communications/unmatched");
  revalidatePath("/admin/dashboard/crm/notifications");
  revalidatePath("/admin/dashboard/crm/contacts");
  if (locationId) revalidatePath(`/admin/dashboard/crm/${locationId}`);
}
