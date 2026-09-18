import { NextResponse } from "next/server";

import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import {
  normalizePhone,
  sendTelnyxSmsFromNumber,
  TELNYX_CHANNEL_NUMBERS,
} from "@/lib/sms/telnyx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

function phoneFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const rawPhone = (metadata as Record<string, unknown>).inbound_phone;
  return normalizePhone(typeof rawPhone === "string" ? rawPhone : null);
}

export async function POST(req: Request) {
  const admin = await getCurrentAdminOrNull();
  if (!admin) return jsonError("You are not authorized to send CRM text messages.", 401);
  if (!CRM_WRITE_ROLES.includes(admin.role as (typeof CRM_WRITE_ROLES)[number])) {
    return jsonError("You are not authorized to send CRM text messages.", 403);
  }

  const db = getAdminDatabaseClient();
  const input = await req.json().catch(() => null);
  const conversationId = String(input?.conversationId || "").trim();
  const body = String(input?.body || "").trim();
  if (!conversationId || !body) return jsonError("conversationId and body are required.", 400);
  if (body.length > 1600) return jsonError("SMS body must be 1600 characters or fewer.", 400);

  const { data: conversation, error: conversationError } = await db
    .from("crm_conversations")
    .select("id,channel,status,location_id,contact_id,metadata")
    .eq("id", conversationId)
    .is("archived_at", null)
    .maybeSingle();
  if (conversationError || !conversation) return jsonError("CRM SMS conversation not found.", 404);
  if (conversation.channel !== "sms") return jsonError("This conversation is not an SMS thread.", 409);

  const to = phoneFromMetadata(conversation.metadata);
  if (!to || !/^\+1\d{10}$/.test(to)) return jsonError("This SMS thread does not have a valid reply number.", 409);

  const { data: complianceRows } = await db
    .from("crm_messages")
    .select("metadata,created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .eq("message_type", "compliance")
    .order("created_at", { ascending: false })
    .limit(1);
  const latestKeyword = String((complianceRows?.[0]?.metadata as any)?.compliance_keyword || "").toLowerCase();
  if (latestKeyword === "stop") {
    return jsonError("This sender opted out with STOP. Reply is blocked until a START message is received.", 409);
  }

  if (conversation.contact_id) {
    const { data: contact } = await db
      .from("crm_contacts")
      .select("do_not_contact,sms_consent_status")
      .eq("id", conversation.contact_id)
      .maybeSingle();
    if (contact?.do_not_contact || ["denied", "opted_out", "revoked"].includes(String(contact?.sms_consent_status || "").toLowerCase())) {
      return jsonError("This contact is opted out or marked do not contact.", 409);
    }
  }

  const now = new Date().toISOString();
  const { data: pending, error: pendingError } = await db
    .from("crm_messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      channel: "sms",
      message_type: "message",
      sender_user_id: admin.user_id,
      body_text: body,
      provider: "telnyx",
      status: "queued",
      source_system: "crm_sms",
      metadata: {
        from: TELNYX_CHANNEL_NUMBERS.crm,
        to,
        senderRole: admin.role,
        directThreadReply: true,
      },
    })
    .select("id")
    .single();
  if (pendingError || !pending?.id) return jsonError("Unable to save the SMS before sending.", 500);

  await db.from("crm_message_recipients").insert({
    message_id: pending.id,
    recipient_type: "to",
    address: to,
    delivery_status: "queued",
    consent_snapshot: {
      status: conversation.contact_id ? "crm_contact" : "inbound_conversation",
      source: "crm_thread",
    },
    suppression_snapshot: { suppressed: false },
  });

  try {
    const sent = await sendTelnyxSmsFromNumber({
      to,
      body,
      fromNumber: TELNYX_CHANNEL_NUMBERS.crm,
    });
    const sentAt = new Date().toISOString();
    await Promise.all([
      db.from("crm_messages").update({
        provider_message_id: sent.id,
        status: sent.status === "delivered" ? "delivered" : "sent",
        sent_at: sentAt,
        delivered_at: sent.status === "delivered" ? sentAt : null,
        updated_at: sentAt,
      }).eq("id", pending.id),
      db.from("crm_message_recipients").update({
        delivery_status: sent.status,
        provider_recipient_id: sent.id,
      }).eq("message_id", pending.id),
      db.from("crm_conversations").update({
        status: "waiting_on_customer",
        last_message_at: sentAt,
        last_outbound_at: sentAt,
        is_unread: false,
        unread_count: 0,
        updated_at: sentAt,
      }).eq("id", conversationId),
      db.from("crm_message_notifications").update({
        read_at: sentAt,
        read_by: admin.user_id,
      }).eq("conversation_id", conversationId).is("read_at", null),
    ]);

    return NextResponse.json({
      success: true,
      messageId: pending.id,
      conversationId,
      providerMessageId: sent.id,
      status: sent.status,
      to,
    });
  } catch (error) {
    const failure = error instanceof Error ? error.message : "Unknown Telnyx error";
    await Promise.all([
      db.from("crm_messages").update({
        status: "failed",
        failed_at: now,
        failure_reason: failure,
        updated_at: new Date().toISOString(),
      }).eq("id", pending.id),
      db.from("crm_message_recipients").update({
        delivery_status: "failed",
      }).eq("message_id", pending.id),
    ]);
    return jsonError(failure, 502);
  }
}
