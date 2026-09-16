import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { loadSocialConnectionSecrets } from "@/lib/marketing/social-secrets";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

export async function POST(request: Request) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const form = await request.formData();
  const conversationId = String(form.get("conversation_id") || "");
  const reply = String(form.get("reply") || "").trim();
  if (!conversationId || !reply) return NextResponse.json({ error: "Conversation and reply are required." }, { status: 400 });

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("social_community_conversations")
    .select("id,provider,conversation_type,risk_level,source_post_id,contact_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (conversationError || !conversation) return NextResponse.json({ error: "Conversation was not found." }, { status: 404 });
  if (conversation.risk_level === "red") return NextResponse.json({ error: "This conversation must be handled by a person." }, { status: 409 });
  if (!["instagram", "facebook"].includes(conversation.provider)) return NextResponse.json({ error: "Direct replies are not available for this network yet. Take over the conversation instead." }, { status: 409 });

  const [{ data: contact }, { data: inbound }, { data: connection }] = await Promise.all([
    supabaseAdmin.from("social_community_contacts").select("external_user_id").eq("id", conversation.contact_id).maybeSingle(),
    supabaseAdmin.from("social_community_messages").select("external_message_id").eq("conversation_id", conversationId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("marketing_social_connections").select("id,provider_account_id,status,token_expires_at").eq("scope", "platform").eq("provider", conversation.provider).eq("status", "connected").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!connection?.id) return NextResponse.json({ error: `Reconnect ${conversation.provider === "instagram" ? "Instagram" : "Facebook"} before sending replies.` }, { status: 409 });
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now()) return NextResponse.json({ error: `Reconnect ${conversation.provider === "instagram" ? "Instagram" : "Facebook"} before sending replies.` }, { status: 409 });

  const { accessToken } = await loadSocialConnectionSecrets(connection.id);
  const version = process.env.META_GRAPH_VERSION || "v23.0";
  let result: any;
  if (conversation.conversation_type === "dm") {
    if (!contact?.external_user_id || !connection.provider_account_id) return NextResponse.json({ error: "This conversation is missing the information needed to reply." }, { status: 409 });
    result = await providerPost(`https://graph.facebook.com/${version}/${encodeURIComponent(connection.provider_account_id)}/messages`, accessToken, {
      recipient: { id: contact.external_user_id },
      message: { text: reply },
    });
  } else {
    const commentId = inbound?.external_message_id;
    if (!commentId) return NextResponse.json({ error: "This comment can’t be replied to automatically." }, { status: 409 });
    const endpoint = conversation.provider === "instagram" ? "replies" : "comments";
    result = await providerPost(`https://graph.facebook.com/${version}/${encodeURIComponent(commentId)}/${endpoint}`, accessToken, { message: reply });
  }

  const now = new Date().toISOString();
  await supabaseAdmin.from("social_community_messages").insert({
    conversation_id: conversationId,
    provider: conversation.provider,
    external_message_id: result?.id ? String(result.id) : null,
    direction: "outbound",
    sender_type: "human",
    body: reply,
    status: "sent",
    sent_by_user_id: admin.user_id,
    created_at: now,
    metadata: { provider_response_id: result?.id || null },
  });
  await supabaseAdmin.from("social_community_conversations").update({ status: "human_handled", assigned_to_user_id: admin.user_id, last_message_at: now }).eq("id", conversationId);
  return NextResponse.redirect(new URL(`/admin/dashboard/marketing/community?conversation=${encodeURIComponent(conversationId)}&sent=1`, request.url), 303);
}
