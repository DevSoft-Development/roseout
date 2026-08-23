import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

function checked(form: FormData, key: string) {
  return form.get(key) === "on";
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  const form = await request.formData();
  const emailMode = form.get("email_sync_mode") === "all" ? "all" : "crm_related_only";
  const calendarDirection = ["microsoft_to_theouthaven", "theouthaven_to_microsoft", "two_way"].includes(String(form.get("calendar_sync_direction")))
    ? String(form.get("calendar_sync_direction"))
    : "two_way";
  const taskDirection = ["microsoft_to_theouthaven", "theouthaven_to_microsoft", "two_way"].includes(String(form.get("task_sync_direction")))
    ? String(form.get("task_sync_direction"))
    : "two_way";

  const { error } = await supabaseAdmin.from("microsoft_365_sync_preferences").upsert({
    user_id: admin.user_id,
    email_sync_enabled: checked(form, "email_sync_enabled"),
    email_sync_mode: emailMode,
    include_internal_mail: checked(form, "include_internal_mail"),
    sync_attachments: checked(form, "sync_attachments"),
    queue_unmatched_email: checked(form, "queue_unmatched_email"),
    calendar_sync_enabled: checked(form, "calendar_sync_enabled"),
    calendar_sync_direction: calendarDirection,
    task_sync_enabled: checked(form, "task_sync_enabled"),
    task_sync_direction: taskDirection,
    task_link_to_crm: checked(form, "task_link_to_crm"),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;

  return NextResponse.redirect(new URL("/admin/dashboard/settings/microsoft-365?saved=1", request.url), 303);
}
