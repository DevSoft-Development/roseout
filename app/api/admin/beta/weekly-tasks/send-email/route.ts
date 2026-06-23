import { NextResponse } from "next/server";
import { sendBetaRemindersForActiveTesters } from "@/lib/beta/reminderEmails";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBetaAdmin, safeError } from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  try {
    const results = await sendBetaRemindersForActiveTesters("weekly_tasks");
    const sent = results.filter((result) => result.status === "sent").length;
    await supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: auth.adminUser?.user_id ?? null, actor_email: auth.adminUser?.email ?? null, actor_role: auth.adminUser?.role ?? null, action: "weekly_task_email_sent", entity_type: "beta_email_reminder", summary: "Sent weekly beta task email to active beta testers", metadata: { sent, total: results.length } });
    return NextResponse.json({ success: true, sent, total: results.length, message: `Weekly task email sent to ${sent} active beta testers.` });
  } catch (error) {
    console.error("SEND_WEEKLY_TASK_EMAILS", error);
    return safeError("Unable to send weekly beta task email.", 500);
  }
}
