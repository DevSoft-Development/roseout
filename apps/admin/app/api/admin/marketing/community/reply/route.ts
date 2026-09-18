import { NextResponse } from "next/server";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { sendCommunityReply } from "@/lib/marketing/social-community-provider";

export async function POST(request: Request) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const form = await request.formData();
  const conversationId = String(form.get("conversation_id") || "");
  const reply = String(form.get("reply") || "").trim();
  if (!conversationId || !reply) return NextResponse.json({ error: "Conversation and reply are required." }, { status: 400 });

  try {
    await sendCommunityReply({
      conversationId,
      reply,
      senderType: "human",
      sentByUserId: admin.user_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The reply could not be sent.";
    const retryable = /not configured|network|fetch|timeout|temporar|5\d\d/i.test(message);
    return NextResponse.json({ error: message }, { status: retryable ? 503 : 409 });
  }

  return NextResponse.redirect(new URL(`/admin/dashboard/marketing/community?conversation=${encodeURIComponent(conversationId)}&sent=1`, request.url), 303);
}
