import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const form = await request.formData();
  const operatingMode = String(form.get("operating_mode") || "assisted");
  if (!["suggest", "assisted", "autopilot"].includes(operatingMode)) return NextResponse.json({ error: "Choose a valid Social Manager mode." }, { status: 400 });
  const value = (key: string) => form.get(key) === "true";
  const { error } = await supabaseAdmin.from("social_manager_settings").upsert({
    scope: "platform",
    operating_mode: operatingMode,
    handle_basic_questions: value("handle_basic_questions"),
    handle_outing_requests: value("handle_outing_requests"),
    handle_business_questions: value("handle_business_questions"),
    handle_creator_questions: value("handle_creator_questions"),
    handle_comments: value("handle_comments"),
    handle_direct_messages: value("handle_direct_messages"),
    always_human_topics: ["complaints", "payments", "legal", "safety", "media", "partnership_negotiations"],
    updated_at: new Date().toISOString(),
    updated_by_user_id: admin.user_id,
  }, { onConflict: "scope" });
  if (error) return NextResponse.json({ error: "Settings could not be saved." }, { status: 500 });
  return NextResponse.redirect(new URL("/admin/dashboard/marketing/social-manager/settings?saved=1", request.url), 303);
}
