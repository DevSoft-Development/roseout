import { NextResponse } from "next/server";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { normalizePhone, sendCrmSms, TELNYX_CHANNEL_NUMBERS } from "@/lib/sms/telnyx";

export const dynamic = "force-dynamic";

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

async function getAuthorizedContact(db: ReturnType<typeof getAdminDatabaseClient>, locationId: string, to: string) {
  const { data: links, error: linkError } = await db
    .from("crm_account_locations")
    .select("account_id")
    .eq("location_id", locationId)
    .eq("status", "active");
  if (linkError) throw linkError;
  const accountIds = [...new Set((links || []).map((row: any) => row.account_id).filter(Boolean))];
  if (!accountIds.length) return null;

  const { data: relationships, error: relationshipError } = await db
    .from("crm_account_contacts")
    .select("contact_id")
    .in("account_id", accountIds)
    .eq("is_active", true);
  if (relationshipError) throw relationshipError;
  const contactIds = [...new Set((relationships || []).map((row: any) => row.contact_id).filter(Boolean))];
  if (!contactIds.length) return null;

  const { data: contact, error: contactError } = await db
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

export async function POST(request: Request) {
  try {
    const actor = await requireAdminRole(CRM_WRITE_ROLES);
    const input = await request.json().catch(() => ({}));
    const locationId = String(input?.locationId || "").trim();
    const to = normalizePhone(input?.to);
    const body = String(input?.body || "").trim();

    if (!locationId || !to || !body) return jsonError("locationId, to, and body are required.", 400);
    if (!/^\+1\d{10}$/.test(to)) return jsonError("CRM SMS requires a valid US/Canada mobile number.", 400);
    if (body.length > 1600) return jsonError("SMS body must be 1600 characters or fewer.", 400);

    const db = getAdminDatabaseClient();
    const { data: location, error: locationError } = await db
      .from("locations")
      .select("id,name")
      .eq("id", locationId)
      .maybeSingle();
    if (locationError || !location) return jsonError("Location not found.", 404);

    const contact = await getAuthorizedContact(db, locationId, to);
    if (!contact) return jsonError("This phone number is not an active CRM contact for the selected location.", 403);
    if (contact.do_not_contact || ["denied", "opted_out", "revoked"].includes(String(contact.sms_consent_status || "").toLowerCase())) {
      return jsonError("This contact is opted out or marked do not contact.", 409);
    }

    const sent = await sendCrmSms({ to, body });
    const now = new Date().toISOString();

    const { data: conversation } = await db
      .from("crm_conversations")
      .select("id")
      .eq("location_id", locationId)
      .eq("channel", "sms")
      .eq("contact_id", contact.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId = conversation?.id || null;
    if (!conversationId) {
      const { data: created, error: createError } = await db
        .from("crm_conversations")
        .insert({
          conversation_key: `sms:${locationId}:${to}`,
          channel: "sms",
          status: "waiting_on_customer",
          location_id: locationId,
          contact_id: contact.id,
          owner_user_id: actor.user_id,
          priority: "normal",
          is_unread: false,
          unread_count: 0,
          metadata: { createdFrom: "admin_location_sms" },
        })
        .select("id")
        .single();
      if (createError) throw createError;
      conversationId = created.id;
    }

    const { data: message, error: messageError } = await db
      .from("crm_messages")
      .insert({
        conversation_id: conversationId,
        direction: "outbound",
        channel: "sms",
        message_type: "message",
        sender_user_id: actor.user_id,
        contact_id: contact.id,
        body_text: body,
        provider: "telnyx",
        provider_message_id: sent.id,
        status: sent.status === "delivered" ? "delivered" : "sent",
        sent_at: now,
        delivered_at: sent.status === "delivered" ? now : null,
        source_system: "crm_sms",
        metadata: { locationId, contactId: contact.id },
      })
      .select("id")
      .single();
    if (messageError) throw messageError;

    await Promise.all([
      db.from("crm_message_recipients").insert({
        message_id: message.id,
        contact_id: contact.id,
        recipient_type: "to",
        address: to,
        delivery_status: sent.status,
        provider_recipient_id: sent.id,
        consent_snapshot: { status: contact.sms_consent_status || "unknown", source: "crm_contact" },
        suppression_snapshot: { suppressed: Boolean(contact.do_not_contact) },
      }),
      db.from("crm_activities").insert({
        location_id: locationId,
        contact_id: contact.id,
        actor_user_id: actor.user_id,
        activity_type: "sms",
        direction: "outbound",
        channel: "sms",
        summary: `SMS sent from ${TELNYX_CHANNEL_NUMBERS.crm}`,
        body,
        occurred_at: now,
        source_system: "crm_sms",
        source_table: "crm_messages",
        source_record_id: message.id,
        visibility: "internal",
        is_system_generated: false,
        metadata: { provider: "telnyx", providerMessageId: sent.id },
      }),
      db.from("communication_logs").insert({
        channel: "sms",
        direction: "outbound",
        from_address: TELNYX_CHANNEL_NUMBERS.crm,
        to_address: to,
        recipient_type: "location",
        recipient_id: locationId,
        subject: "CRM text message",
        body,
        status: sent.status || "sent",
        provider_message_id: sent.id,
        created_by: actor.user_id,
        metadata: {
          source_system: "crm_sms",
          source_table: "crm_messages",
          canonical_crm_message_id: message.id,
          contact_id: contact.id,
        },
      }),
      db.from("crm_conversations").update({
        status: "waiting_on_customer",
        last_message_at: now,
        last_outbound_at: now,
        is_unread: false,
        updated_at: now,
      }).eq("id", conversationId),
    ]);

    return NextResponse.json({
      success: true,
      messageId: message.id,
      conversationId,
      providerMessageId: sent.id,
      status: sent.status,
      from: TELNYX_CHANNEL_NUMBERS.crm,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to send CRM SMS.", 502);
  }
}
