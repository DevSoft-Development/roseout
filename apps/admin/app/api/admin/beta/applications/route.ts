import { NextRequest, NextResponse } from "next/server";
import { syncUserBetaAccess } from "@/lib/beta/program-access";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { requireBetaAdmin, safeError } from "../_shared";

const BETA_APPLICATION_LIST_FIELDS = "id,name,email,tester_type,status,turnstile_verified,created_at";
const BETA_APPLICATION_MUTATION_FIELDS = "id,name,email,phone,tester_type,status,turnstile_verified,reviewed_by,reviewed_at,created_at,updated_at";

export async function GET() {
  const a = await requireBetaAdmin();
  if (a.error) return a.error;
  const { data, error } = await getAdminDatabaseClient()
    .from("beta_applications")
    .select(BETA_APPLICATION_LIST_FIELDS)
    .order("created_at", { ascending: false })
    .limit(300);
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
    const { data: app, error: updateError } = await getAdminDatabaseClient()
      .from("beta_applications")
      .update({ status, reviewed_by: a.adminUser?.user_id, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .select(BETA_APPLICATION_MUTATION_FIELDS)
      .single();
    if (updateError || !app) return safeError("Unable to update beta application.", 500);
    let sync = null;
    if (status === "approved") {
      const email = String(app.email || "").trim().toLowerCase();
      try {
        sync = await syncUserBetaAccess({ applicationId: app.id, email, name: app.name, phone: app.phone, testerType: app.tester_type, requestedBetaStatus: "approved", source: "giveaway_applications", adminUserId: a.adminUser?.user_id ?? null, actor: a.adminUser });
      } catch (error) {
        await getAdminDatabaseClient().from("admin_audit_logs").insert({ actor_user_id: a.adminUser?.user_id ?? null, target_email: email, action: "beta_approve_failed", entity_type: "beta_application", entity_id: app.id, summary: "Beta application approval failed", metadata: { error: error instanceof Error ? error.message : "Unknown error" } });
        return safeError("Beta approval could not be completed. Please use Repair beta access from the reward admin page.", 500);
      }
    }
    return NextResponse.json({ success: true, application: app, sync, message: status === "approved" ? "Applicant approved and beta access synced." : "Application updated." });
  } catch (error) {
    console.error("ADMIN_BETA_APP_PATCH", error);
    return safeError("Beta application update failed.", 500);
  }
}
