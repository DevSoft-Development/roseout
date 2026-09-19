import { NextResponse } from "next/server";

import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone, sendCrmSms } from "@/lib/sms/telnyx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRM_MAIN_NUMBER = "+15162000701";

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

async function getAuthorizedLocationContact(locationId: string, to: string) {
  const { data: links, error: linkError } = await supabaseAdmin
    .from("crm_account_locations")
    .select("account_id")
    .eq("location_id", locationId)
    .eq("status", "active");
  if (linkError) throw linkError;
  const accountIds = [...new Set((links || []).map((row) => row.account_id).filter(Boolean))];
  if (!accountIds.length) return null;

  const { data: relationships, error: relationshipError } = await supabaseAdmin
    .from("crm_account_contacts")
    .select("contact_id")
    .in("account_id", accountIds)
    .eq("is_active", true);
  if (relationshipError) throw relationshipError;
  const contactIds = [...new Set((relationships || []).map((row) => row.contact_id).filter(Boolean))];
  if (!contactIds.length) return null;

  const { data: contact, error: contactError } = await supabaseAdmin
    .from("crm_contacts")
    .select("id,phone_e164,sms_consent_status,do_not_contact")
    .in("id", contactIds)
    .eq("phone_e164", to)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (contactError) throw contactError;
  return contact;
}

async function getOrCreateConversation(params: { locationId: string; to: string; userId: string; contactId: string }) {
  const conversationKey = `sms:${params.locationId}:${params.to}`;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("crm_conversations")
    .select("id")
    .eq("conversation_key", conversationKey)
    .eq("location_id", params.locationId)
    .is("archived_at", null)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing.id as string;

  const { data: created, error: createError } = await supabaseAdmin
    .from("crm_conversations")
    .insert({
      conversation_key: conversationKey,
      channel: "sms",
      status: "waiting_on_customer",
      location_id: params.locationId,
      contact_id: params.contactId,
      owner_user_id: params.userId,
      priority: "normal",
      is_unread: false,
      unread_count: 0,
      metadata: { createdFrom: "crm_sms_composer", routing_status: "matched", inbound_phone: params.to },
    })
    .select("id")
    .single();
  if (createError || !created?.id) throw createError || new Error("Unable to create SMS conversation");
  return created.id as string;
}

export async function POST(req: Request) {
  const { adminUser, error: authError } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.smsOneToOne);
  if (authError || !adminUser) return authError || jsonError("You are not authorized to send CRM text messages.", 403);
  const sender = { userId: adminUser.user_id, role: adminUser.role };

  const input = await req.json().catch(() => null);
  const locationId = String(input?.locationId || "").trim();
  const to = normalizePhone(input?.to);
  const body = String(input?.body || "").trim();
  if (!locationId || !to || !body) return jsonError("locationId, to, and body are required.", 400);
  if (!/^\+1\d{10}$/.test(to)) return jsonError("CRM SMS currently requires a valid US/Canada E.164 phone number.", 400);
  if (body.length > 1600) return jsonError("SMS body must be 1600 characters or fewer.", 400);

  const { data: location, error: locationError } = await supabaseAdmin.from("locations").select("id").eq("id", locationId).maybeSingle();
  if (locationError || !location) return jsonError("Location not found.", 404);

  let exactContact: any;
  try {
    exactContact = await getAuthorizedLocationContact(locationId, to);
  } catch (error) {
    console.error("Unable to validate CRM SMS recipient", error);
    return jsonError("Unable to validate this SMS recipient.", 500);
  }
  if (!exactContact) return jsonError("This phone number is not an active CRM contact for the selected location.", 403);
  if (exactContact.do_not_contact || ["denied", "opted_out", "revoked"].includes(String(exactContact.sms_consent_status || "").toLowerCase())) {
    return jsonError("This contact is opted out or marked do not contact. SMS was not sent.", 409);
  }

  let conversationId: string;
  try {
    conversationId = await getOrCreateConversation({ locationId, to, userId: sender.userId, contactId: exactContact.id });
  } catch (error) {
    console.error("Unable to create CRM SMS conversation", error);
    return jsonError("Unable to create the CRM conversation.", 500);
  }

  const now = new Date().toISOString();
  const { data: pendingMessage, error: pendingError } = await supabaseAdmin
    .from("crm_messages")
    .insert({ conversation_id: conversationId, direction: "outbound", channel: "sms", message_type: "message", sender_user_id: sender.userId, body_text: body, provider: "telnyx", status: "sending", source_system: "crm_sms", metadata: { locationId, contactId: exactContact.id, senderRole: sender.role } })
    .select("id")
    .single();
  if (pendingError || !pendingMessage?.id) return jsonError("Unable to save the SMS before sending.", 500);

  await supabaseAdmin.from("crm_message_recipients").insert({ message_id: pendingMessage.id, recipient_type: "to", address: to, delivery_status: "sending", consent_snapshot: { status: exactContact.sms_consent_status || "unknown", source: "crm_contact" }, suppression_snapshot: { suppressed: Boolean(exactContact.do_not_contact) } });

  try {
    const sent = await sendCrmSms({ to, body });
    const sentAt = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from("crm_messages").update({ provider_message_id: sent.id, status: sent.status === "delivered" ? "delivered" : "sent", sent_at: sentAt, delivered_at: sent.status === "delivered" ? sentAt : null, metadata: { locationId, contactId: exactContact.id, senderRole: sender.role }, updated_at: sentAt }).eq("id", pendingMessage.id),
      supabaseAdmin.from("crm_message_recipients").update({ delivery_status: sent.status, provider_recipient_id: sent.id }).eq("message_id", pendingMessage.id),
      supabaseAdmin.from("crm_conversations").update({ status: "waiting_on_customer", last_message_at: sentAt, last_outbound_at: sentAt, is_unread: false, updated_at: sentAt }).eq("id", conversationId),
      supabaseAdmin.from("crm_activities").insert({ location_id: locationId, contact_id: exactContact.id, actor_user_id: sender.userId, activity_type: "sms", direction: "outbound", channel: "sms", summary: `SMS sent from ${CRM_MAIN_NUMBER}`, body, occurred_at: sentAt, source_system: "crm_sms", source_table: "crm_messages", source_record_id: pendingMessage.id, visibility: "internal", is_system_generated: false, metadata: { provider: "telnyx", providerMessageId: sent.id } }),
    ]);
    return NextResponse.json({ success: true, messageId: pendingMessage.id, conversationId, providerMessageId: sent.id, status: sent.status, from: CRM_MAIN_NUMBER });
  } catch (error) {
    const failure = error instanceof Error ? error.message : "Unknown Telnyx error";
    await Promise.all([
      supabaseAdmin.from("crm_messages").update({ status: "failed", failed_at: now, failure_reason: failure, updated_at: new Date().toISOString() }).eq("id", pendingMessage.id),
      supabaseAdmin.from("crm_message_recipients").update({ delivery_status: "failed" }).eq("message_id", pendingMessage.id),
    ]);
    return jsonError(failure, 502);
  }
}
