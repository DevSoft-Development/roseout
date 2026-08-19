import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendCrmSms } from "@/lib/sms/telnyx";
import { CRM_MAIN_NUMBER } from "@/lib/crm/inbound-sms-routing";

const AUTO_ACK_COOLDOWN_MS = 15 * 60 * 1000;
const HUMAN_REPLY_SUPPRESSION_MS = 30 * 60 * 1000;

export type CrmAutoAckResult = {
  sent: boolean;
  skippedReason?: string;
  messageId?: string;
  providerMessageId?: string | null;
  body?: string;
};

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function firstName(value: unknown) {
  return cleanText(value).split(/\s+/)[0] || "";
}

function recapSnippet(body: string) {
  const cleaned = cleanText(body).replace(/[“”"]/g, "'");
  if (cleaned.length < 9 || /^(hi|hello|hey|thanks|thank you|good morning|good afternoon|good evening)[!. ]*$/i.test(cleaned)) return "";
  return cleaned.length <= 92 ? cleaned : `${cleaned.slice(0, 89).trimEnd()}...`;
}

export function buildCrmAutoAcknowledgement(params: {
  incomingBody: string;
  contactName?: string | null;
  matched: boolean;
  hasPriorConversation: boolean;
}) {
  const name = firstName(params.contactName);
  const greeting = name ? `Hi ${name}, ` : "";

  if (params.hasPriorConversation) {
    const recap = recapSnippet(params.incomingBody);
    if (recap) {
      return `${greeting}thanks for the update. We received your message about “${recap}” and added it to your conversation. Someone from TheOutHaven will follow up shortly.`;
    }
    return `${greeting}thanks for the update. We received your message and added it to your conversation. Someone from TheOutHaven will follow up shortly.`;
  }

  if (params.matched) {
    return `${greeting}thanks for messaging TheOutHaven. We received your message and someone from our team will be in touch shortly.`;
  }

  return "Thanks for contacting TheOutHaven. We received your message and someone from our team will be in touch shortly.";
}

async function latestStopBlocksReply(conversationId: string) {
  const { data, error } = await supabaseAdmin
    .from("crm_messages")
    .select("metadata")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .eq("message_type", "compliance")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return String((data?.[0]?.metadata as Record<string, unknown> | undefined)?.compliance_keyword || "").toLowerCase() === "stop";
}

export async function maybeAutoAcknowledgeCrmSms(params: {
  conversationId: string;
  inboundMessageId: string;
  from: string;
  incomingBody: string;
  matched: boolean;
  contactId: string | null;
}) : Promise<CrmAutoAckResult> {
  if (!params.conversationId || !params.inboundMessageId || !params.from) return { sent: false, skippedReason: "missing_context" };
  if (await latestStopBlocksReply(params.conversationId)) return { sent: false, skippedReason: "opted_out" };

  const now = Date.now();
  const cooldownCutoff = new Date(now - AUTO_ACK_COOLDOWN_MS).toISOString();
  const humanCutoff = new Date(now - HUMAN_REPLY_SUPPRESSION_MS).toISOString();

  const [historyResult, recentAutoAckResult, recentHumanResult, contactResult] = await Promise.all([
    supabaseAdmin
      .from("crm_messages")
      .select("id,direction,source_system,sender_user_id,created_at")
      .eq("conversation_id", params.conversationId)
      .neq("id", params.inboundMessageId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("crm_messages")
      .select("id")
      .eq("conversation_id", params.conversationId)
      .eq("direction", "outbound")
      .eq("source_system", "crm_sms_auto_ack")
      .gte("created_at", cooldownCutoff)
      .limit(1),
    supabaseAdmin
      .from("crm_messages")
      .select("id")
      .eq("conversation_id", params.conversationId)
      .eq("direction", "outbound")
      .not("sender_user_id", "is", null)
      .gte("created_at", humanCutoff)
      .limit(1),
    params.contactId
      ? supabaseAdmin.from("crm_contacts").select("full_name,first_name").eq("id", params.contactId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  for (const result of [historyResult, recentAutoAckResult, recentHumanResult, contactResult]) {
    if (result.error) throw result.error;
  }

  if (recentAutoAckResult.data?.length) return { sent: false, skippedReason: "cooldown" };
  if (recentHumanResult.data?.length) return { sent: false, skippedReason: "recent_human_reply" };

  const contactName = cleanText(contactResult.data?.first_name || contactResult.data?.full_name) || null;
  const body = buildCrmAutoAcknowledgement({
    incomingBody: params.incomingBody,
    contactName,
    matched: params.matched,
    hasPriorConversation: Boolean(historyResult.data?.length),
  });

  // A deterministic 15-minute source key makes bursty concurrent webhooks idempotent.
  const bucket = Math.floor(now / AUTO_ACK_COOLDOWN_MS);
  const sourceRecordId = `crm-auto-ack:${params.conversationId}:${bucket}`;
  const queuedAt = new Date().toISOString();
  const { data: pending, error: pendingError } = await supabaseAdmin
    .from("crm_messages")
    .insert({
      conversation_id: params.conversationId,
      direction: "outbound",
      channel: "sms",
      message_type: "message",
      body_text: body,
      provider: "telnyx",
      status: "queued",
      source_system: "crm_sms_auto_ack",
      source_record_id: sourceRecordId,
      metadata: {
        from: CRM_MAIN_NUMBER,
        to: params.from,
        autoAcknowledgement: true,
        acknowledgmentPolicy: params.matched ? (historyResult.data?.length ? "existing_conversation" : "known_contact") : "new_unmatched",
        inboundMessageId: params.inboundMessageId,
      },
    })
    .select("id")
    .single();

  if (pendingError) {
    if (pendingError.code === "23505") return { sent: false, skippedReason: "cooldown_race" };
    throw pendingError;
  }

  const { error: recipientError } = await supabaseAdmin.from("crm_message_recipients").insert({
    message_id: pending.id,
    recipient_type: "to",
    address: params.from,
    delivery_status: "queued",
    consent_snapshot: { status: params.matched ? "crm_contact" : "inbound_conversation", source: "inbound_auto_ack" },
    suppression_snapshot: { suppressed: false },
  });
  if (recipientError) {
    await supabaseAdmin.from("crm_messages").update({ status: "failed", failed_at: queuedAt, failure_reason: recipientError.message }).eq("id", pending.id);
    throw recipientError;
  }

  try {
    const sent = await sendCrmSms({ to: params.from, body });
    const sentAt = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from("crm_messages").update({
        provider_message_id: sent.id,
        status: sent.status === "delivered" ? "delivered" : "sent",
        sent_at: sentAt,
        delivered_at: sent.status === "delivered" ? sentAt : null,
        updated_at: sentAt,
      }).eq("id", pending.id),
      supabaseAdmin.from("crm_message_recipients").update({
        delivery_status: sent.status,
        provider_recipient_id: sent.id,
      }).eq("message_id", pending.id),
      supabaseAdmin.from("crm_messages").update({ replied_at: sentAt, updated_at: sentAt }).eq("id", params.inboundMessageId),
      // An automatic acknowledgment does not resolve the sales task; keep it waiting on the team.
      supabaseAdmin.from("crm_conversations").update({
        status: "waiting_on_team",
        last_message_at: sentAt,
        last_outbound_at: sentAt,
        updated_at: sentAt,
      }).eq("id", params.conversationId),
    ]);
    return { sent: true, messageId: pending.id, providerMessageId: sent.id, body };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failure = error instanceof Error ? error.message : "Unknown CRM auto-acknowledgment error";
    await Promise.all([
      supabaseAdmin.from("crm_messages").update({ status: "failed", failed_at: failedAt, failure_reason: failure, updated_at: failedAt }).eq("id", pending.id),
      supabaseAdmin.from("crm_message_recipients").update({ delivery_status: "failed" }).eq("message_id", pending.id),
    ]);
    throw error;
  }
}
