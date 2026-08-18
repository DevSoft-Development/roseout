import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone } from "@/lib/sms/telnyx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEND_ROLES = new Set([
  "superadmin",
  "admin",
  "manager",
  "editor",
  "ambassador",
  "partner_ambassador",
  "experience",
  "experience_team",
]);
const CRM_MAIN_NUMBER = "+15162000811";

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

async function requireCrmSender() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) return null;
  const { data: admin } = await supabaseAdmin
    .from("admin_users")
    .select("user_id,role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!admin?.role || !SEND_ROLES.has(String(admin.role))) return null;
  return { userId: user.id, role: String(admin.role) };
}

function phoneFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  return normalizePhone((metadata as Record<string, unknown>).inbound_phone);
}

async function sendTelnyx(to: string, body: string) {
  const apiKey = process.env.TELNYX_CRM_API_KEY || process.env.TELNYX_TRANSACTIONAL_API_KEY || process.env.TELNYX_API_KEY;
  const from = normalizePhone(process.env.TELNYX_CRM_PHONE_NUMBER || CRM_MAIN_NUMBER);
  const messagingProfileId = process.env.TELNYX_CRM_MESSAGING_PROFILE_ID;
  if (!apiKey || !messagingProfileId) throw new Error("CRM SMS is not configured.");
  if (from !== CRM_MAIN_NUMBER) throw new Error("TELNYX_CRM_PHONE_NUMBER must be +15162000811.");

  const response = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, text: body, messaging_profile_id: messagingProfileId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.detail || payload?.errors?.[0]?.title || payload?.message || response.statusText;
    throw new Error(`Telnyx CRM SMS failed (${response.status}): ${String(detail || "unknown error")}`);
  }
  const data = payload?.data || payload;
  return { id: String(data?.id || "") || null, status: String(data?.to?.[0]?.status || data?.status || "queued") };
}

export async function POST(req: Request) {
  const sender = await requireCrmSender();
  if (!sender) return jsonError("You are not authorized to send CRM text messages.", 403);

  const input = await req.json().catch(() => null);
  const conversationId = String(input?.conversationId || "").trim();
  const body = String(input?.body || "").trim();
  if (!conversationId || !body) return jsonError("conversationId and body are required.", 400);
  if (body.length > 1600) return jsonError("SMS body must be 1600 characters or fewer.", 400);

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("crm_conversations")
    .select("id,channel,status,location_id,contact_id,metadata")
    .eq("id", conversationId)
    .is("archived_at", null)
    .maybeSingle();
  if (conversationError || !conversation) return jsonError("CRM SMS conversation not found.", 404);
  if (conversation.channel !== "sms") return jsonError("This conversation is not an SMS thread.", 409);

  const to = phoneFromMetadata(conversation.metadata);
  if (!to || !/^\+1\d{10}$/.test(to)) return jsonError("This SMS thread does not have a valid reply number.", 409);

  const { data: complianceRows } = await supabaseAdmin
    .from("crm_messages")
    .select("metadata,created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .eq("message_type", "compliance")
    .order("created_at", { ascending: false })
    .limit(1);
  const latestKeyword = String((complianceRows?.[0]?.metadata as any)?.compliance_keyword || "").toLowerCase();
  if (latestKeyword === "stop") return jsonError("This sender opted out with STOP. Reply is blocked until a START message is received.", 409);

  if (conversation.contact_id) {
    const { data: contact } = await supabaseAdmin
      .from("crm_contacts")
      .select("do_not_contact,sms_consent_status")
      .eq("id", conversation.contact_id)
      .maybeSingle();
    if (contact?.do_not_contact || ["denied", "opted_out", "revoked"].includes(String(contact?.sms_consent_status || "").toLowerCase())) {
      return jsonError("This contact is opted out or marked do not contact.", 409);
    }
  }

  const now = new Date().toISOString();
  const { data: pending, error: pendingError } = await supabaseAdmin
    .from("crm_messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      channel: "sms",
      message_type: "message",
      sender_user_id: sender.userId,
      body_text: body,
      provider: "telnyx",
      status: "queued",
      source_system: "crm_sms",
      metadata: { from: CRM_MAIN_NUMBER, to, senderRole: sender.role, directThreadReply: true },
    })
    .select("id")
    .single();
  if (pendingError || !pending?.id) return jsonError("Unable to save the SMS before sending.", 500);

  await supabaseAdmin.from("crm_message_recipients").insert({
    message_id: pending.id,
    recipient_type: "to",
    address: to,
    delivery_status: "queued",
    consent_snapshot: { status: conversation.contact_id ? "crm_contact" : "inbound_conversation", source: "crm_thread" },
    suppression_snapshot: { suppressed: false },
  });

  try {
    const sent = await sendTelnyx(to, body);
    const sentAt = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from("crm_messages").update({
        provider_message_id: sent.id,
        status: sent.status === "delivered" ? "delivered" : "sent",
        sent_at: sentAt,
        delivered_at: sent.status === "delivered" ? sentAt : null,
        updated_at: sentAt,
      }).eq("id", pending.id),
      supabaseAdmin.from("crm_message_recipients").update({ delivery_status: sent.status, provider_recipient_id: sent.id }).eq("message_id", pending.id),
      supabaseAdmin.from("crm_conversations").update({
        status: "waiting_on_customer",
        last_message_at: sentAt,
        last_outbound_at: sentAt,
        is_unread: false,
        unread_count: 0,
        updated_at: sentAt,
      }).eq("id", conversationId),
      supabaseAdmin.from("crm_message_notifications").update({ read_at: sentAt, read_by: sender.userId }).eq("conversation_id", conversationId).is("read_at", null),
    ]);

    return NextResponse.json({ success: true, messageId: pending.id, conversationId, providerMessageId: sent.id, status: sent.status, to });
  } catch (error) {
    const failure = error instanceof Error ? error.message : "Unknown Telnyx error";
    await Promise.all([
      supabaseAdmin.from("crm_messages").update({ status: "failed", failed_at: now, failure_reason: failure, updated_at: new Date().toISOString() }).eq("id", pending.id),
      supabaseAdmin.from("crm_message_recipients").update({ delivery_status: "failed" }).eq("message_id", pending.id),
    ]);
    return jsonError(failure, 502);
  }
}
