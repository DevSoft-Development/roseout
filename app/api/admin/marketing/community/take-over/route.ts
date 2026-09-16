import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const form = await request.formData();
  const id = String(form.get("conversation_id") || "");
  if (!id) return NextResponse.json({ error: "Conversation is required." }, { status: 400 });
  const { error } = await supabaseAdmin.from("social_community_conversations").update({ status: "human_handled", assigned_to_user_id: admin.user_id }).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not take over this conversation." }, { status: 500 });
  return NextResponse.redirect(new URL(`/admin/dashboard/marketing/community?conversation=${encodeURIComponent(id)}`, request.url), 303);
}
