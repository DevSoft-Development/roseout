import { NextRequest, NextResponse } from "next/server";
import { assignWeeklyBetaTasksForTester } from "@/lib/beta/weeklyTasks";
import { findAuthUserIdByEmail, safeUpsertBetaTester } from "@/lib/beta/programAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBetaAdmin, safeError } from "../_shared";

export async function GET() {
  const a = await requireBetaAdmin();
  if (a.error) return a.error;
  const { data, error } = await supabaseAdmin.from("beta_applications").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) return safeError();
  return NextResponse.json({ success: true, applications: data || [] });
}

export async function PATCH(req: NextRequest) {
  const a = await requireBetaAdmin();
  if (a.error) return a.error;
  try {
    const b = await req.json();
    const status = String(b.status || "");
    const id = String(b.id || "");
    if (!id || !status) return safeError("id and status required", 400);
    const { data: app, error: updateError } = await supabaseAdmin
      .from("beta_applications")
      .update({ status, reviewed_by: a.adminUser?.user_id, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError || !app) return safeError("Unable to update beta application.", 500);
    if (status === "approved") {
      const email = String(app.email || "").trim().toLowerCase();
      const userId = await findAuthUserIdByEmail(email);
      const tester = await safeUpsertBetaTester({ applicationId: app.id, fullName: app.name, email, phone: app.phone, testerType: app.tester_type, userId, approvedBy: a.adminUser?.user_id, status: userId ? "active" : "approved" });
      if (tester.error || !tester.data) {
        await supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: a.adminUser?.user_id ?? null, target_email: email, action: "beta_approve_failed", entity_type: "beta_application", entity_id: app.id, summary: "Beta application approval failed", metadata: { error: tester.error?.message || "Unknown error" } });
        return safeError("Beta approval could not be completed. Please use Repair beta access from the reward admin page.", 500);
      }
      await assignWeeklyBetaTasksForTester(tester.data.id);
      await supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: a.adminUser?.user_id ?? null, target_email: email, action: "beta_tasks_assigned", entity_type: "beta_tester", entity_id: tester.data.id, summary: "Weekly beta tasks assigned after admin approval", metadata: {} });
    }
    return NextResponse.json({ success: true, application: app });
  } catch (error) {
    console.error("ADMIN_BETA_APP_PATCH", error);
    return safeError("Beta application update failed.", 500);
  }
}
