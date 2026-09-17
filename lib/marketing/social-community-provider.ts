import "server-only";

import { loadSocialConnectionSecrets } from "@/lib/marketing/social-secrets";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type CommunitySendResult = {
  providerResponseId: string | null;
};

async function providerPost(url: string, accessToken: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  if (!response.ok) throw new Error(parsed?.error?.message || `The social network could not send this reply (${response.status}).`);
  return parsed;
}

function hasScope(granted: unknown, names: string[]) {
  const scopes = Array.isArray(granted) ? granted.map((value) => String(value)) : [];
  return names.some((name) => scopes.includes(name));
}

export async function sendCommunityReply(input: {
  conversationId: string;
  reply: string;
  senderType: "ai" | "human";
  sentByUserId?: string | null;
}) : Promise<CommunitySendResult> {
  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("social_community_conversations")
    .select("id,provider,conversation_type,risk_level,contact_id")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (conversationError || !conversation) throw new Error("Conversation was not found.");
  if (conversation.risk_level === "red") throw new Error("This conversation must be handled by a person.");
  if (!["instagram", "facebook"].includes(conversation.provider)) throw new Error("Direct replies are not available for this network yet.");

  const [{ data: contact }, { data: inbound }, { data: connection }] = await Promise.all([
    supabaseAdmin.from("social_community_contacts").select("external_user_id").eq("id", conversation.contact_id).maybeSingle(),
    supabaseAdmin.from("social_community_messages").select("external_message_id").eq("conversation_id", input.conversationId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("marketing_social_connections").select("id,provider_account_id,status,token_expires_at,granted_scopes").eq("scope", "platform").eq("provider", conversation.provider).eq("status", "connected").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const network = conversation.provider === "instagram" ? "Instagram" : "Facebook";
  if (!connection?.id) throw new Error(`Reconnect ${network} before sending replies.`);
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now()) throw new Error(`Reconnect ${network} before sending replies.`);

  const dm = conversation.conversation_type === "dm";
  const permitted = conversation.provider === "instagram"
    ? hasScope(connection.granted_scopes, dm ? ["instagram_manage_messages", "instagram_business_manage_messages"] : ["instagram_manage_comments", "instagram_business_manage_comments"])
    : hasScope(connection.granted_scopes, dm ? ["pages_messaging"] : ["pages_manage_engagement"]);
  if (!permitted) throw new Error(`${network} is connected, but Community reply access has not been approved for this account yet.`);

  const version = process.env.META_GRAPH_VERSION;
  if (!version) throw new Error("Meta Community access is not configured yet.");
  const { accessToken } = await loadSocialConnectionSecrets(connection.id);
  let result: any;
  if (dm) {
    if (!contact?.external_user_id || !connection.provider_account_id) throw new Error("This conversation is missing the information needed to reply.");
    result = await providerPost(`https://graph.facebook.com/${version}/${encodeURIComponent(connection.provider_account_id)}/messages`, accessToken, {
      recipient: { id: contact.external_user_id },
      message: { text: input.reply },
    });
  } else {
    const commentId = inbound?.external_message_id;
    if (!commentId) throw new Error("This comment cannot be replied to automatically.");
    const endpoint = conversation.provider === "instagram" ? "replies" : "comments";
    result = await providerPost(`https://graph.facebook.com/${version}/${encodeURIComponent(commentId)}/${endpoint}`, accessToken, { message: input.reply });
  }

  const now = new Date().toISOString();
  const { error: messageError } = await supabaseAdmin.from("social_community_messages").insert({
    conversation_id: input.conversationId,
    provider: conversation.provider,
    external_message_id: result?.id ? String(result.id) : null,
    direction: "outbound",
    sender_type: input.senderType,
    body: input.reply,
    status: "sent",
    sent_by_user_id: input.sentByUserId || null,
    created_at: now,
    metadata: { provider_response_id: result?.id || null },
  });
  if (messageError) throw messageError;

  const { error: conversationUpdateError } = await supabaseAdmin.from("social_community_conversations").update({
    status: input.senderType === "ai" ? "ai_handled" : "human_handled",
    assigned_to_user_id: input.senderType === "human" ? input.sentByUserId || null : null,
    last_message_at: now,
  }).eq("id", input.conversationId);
  if (conversationUpdateError) throw conversationUpdateError;

  return { providerResponseId: result?.id ? String(result.id) : null };
}
