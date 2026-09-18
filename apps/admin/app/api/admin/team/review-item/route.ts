import { revalidatePath } from "next/cache";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

const REVIEW_TABLES = new Set([
  "location_change_requests",
  "ambassador_site_visits",
  "ambassador_social_outreach",
  "team_proofs",
  "claim_code_audit_logs",
  "password_reset_audit_logs",
  "workspace_escalations",
  "team_work_sessions",
]);

const REVIEW_ACTIONS = new Set(["approve", "reject"]);
const MAX_REVIEW_NOTES = 1000;

export async function POST(request: Request) {
  const admin = await requireAdminRole(["superadmin", "admin", "manager"]);
  const body = await request.json().catch(() => ({}));

  const table = String(body.table || "");
  if (!REVIEW_TABLES.has(table)) {
    return Response.json({ error: "Unsupported review table." }, { status: 400 });
  }

  const id = String(body.id || "").trim();
  if (!id) {
    return Response.json(
      { error: "Review item id is required." },
      { status: 400 },
    );
  }

  const action = String(body.action || "");
  if (!REVIEW_ACTIONS.has(action)) {
    return Response.json({ error: "Unsupported review action." }, { status: 400 });
  }

  const notes = String(body.notes || "").trim().slice(0, MAX_REVIEW_NOTES);
  const now = new Date().toISOString();
  const status = action === "approve" ? "approved" : "rejected";
  const updates: Record<string, unknown> = { updated_at: now };

  if (table === "team_work_sessions") {
    Object.assign(updates, {
      status,
      approval_status: status,
      approved_by: status === "approved" ? admin.user_id : null,
      approved_at: status === "approved" ? now : null,
      rejection_reason:
        status === "rejected" ? notes || "Rejected by manager" : null,
    });
  } else if (table === "location_change_requests") {
    Object.assign(updates, {
      status,
      reviewed_by: admin.user_id,
      reviewed_at: now,
      review_notes: notes || null,
    });
  } else if (
    ["ambassador_site_visits", "ambassador_social_outreach", "team_proofs"].includes(
      table,
    )
  ) {
    Object.assign(updates, {
      manager_review_status: status,
      reviewed_by: admin.user_id,
      reviewed_at: now,
      rejection_reason:
        action === "reject" ? notes || "Rejected by manager" : null,
    });
  } else {
    Object.assign(updates, { status });
  }

  const adminDb = getAdminDatabaseClient();
  const { data, error } = await adminDb
    .from(table)
    .update(updates)
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  await adminDb
    .from("workspace_audit_logs")
    .insert({
      actor_user_id: admin.user_id,
      action: `manager_${action}`,
      entity_type: table,
      entity_id: data.id,
      new_value: { status, reviewed_at: now },
    })
    .then(undefined, () => undefined);

  revalidatePath("/admin/dashboard/team/review");
  return Response.json({ ok: true, item: { id: data.id, status } });
}
