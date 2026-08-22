"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function updateFraudCase(formData: FormData) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.fraudManage);
  const caseId = stringValue(formData, "caseId");
  const status = stringValue(formData, "status");
  const priority = stringValue(formData, "priority");
  const resolutionNotes = stringValue(formData, "resolutionNotes");
  if (!caseId) throw new Error("caseId is required");

  const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (["open", "investigating", "awaiting_evidence", "actioned", "appealed", "closed"].includes(status)) patch.status = status;
  if (["low", "medium", "high", "urgent"].includes(priority)) patch.priority = priority;
  if (resolutionNotes) patch.resolution_notes = resolutionNotes;
  if (status === "closed") patch.resolved_at = new Date().toISOString();

  const { error } = await supabaseAdmin.from("fraud_cases").update(patch).eq("id", caseId);
  if (error) throw error;

  await supabaseAdmin.from("fraud_audit_log").insert({
    case_id: caseId,
    event_type: "case_updated",
    actor_user_id: admin.user_id,
    payload: { status: patch.status, priority: patch.priority, resolution_notes: resolutionNotes || null },
  });

  revalidatePath("/admin/dashboard/fraud");
  redirect(`/admin/dashboard/fraud?case=${encodeURIComponent(caseId)}`);
}

export async function addFraudCaseNote(formData: FormData) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.fraudManage);
  const caseId = stringValue(formData, "caseId");
  const note = stringValue(formData, "note");
  if (!caseId || !note) throw new Error("caseId and note are required");

  const { error } = await supabaseAdmin.from("fraud_case_notes").insert({ case_id: caseId, note, actor_user_id: admin.user_id });
  if (error) throw error;

  await supabaseAdmin.from("fraud_cases").update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", caseId);
  revalidatePath("/admin/dashboard/fraud");
  redirect(`/admin/dashboard/fraud?case=${encodeURIComponent(caseId)}`);
}

export async function applyFraudAction(formData: FormData) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.fraudEnforce);
  const caseId = stringValue(formData, "caseId");
  const subjectType = stringValue(formData, "subjectType");
  const subjectId = stringValue(formData, "subjectId");
  const actionType = stringValue(formData, "actionType");
  const reason = stringValue(formData, "reason");
  const endsAt = stringValue(formData, "endsAt");

  const allowed = ["monitor", "require_verification", "hold_publication", "remove_content", "limit_account", "hold_payout", "suspend", "ban", "clear", "restore"];
  if (!caseId || !subjectType || !subjectId || !reason || !allowed.includes(actionType)) throw new Error("Invalid enforcement action");

  const { error } = await supabaseAdmin.from("fraud_actions").insert({
    case_id: caseId,
    subject_type: subjectType,
    subject_id: subjectId,
    action_type: actionType,
    reason,
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    actor_user_id: admin.user_id,
    actor_role: admin.role,
  });
  if (error) throw error;

  revalidatePath("/admin/dashboard/fraud");
  redirect(`/admin/dashboard/fraud?case=${encodeURIComponent(caseId)}`);
}

export async function triageFraudReport(formData: FormData) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.fraudManage);
  const reportId = stringValue(formData, "reportId");
  const action = stringValue(formData, "reportAction");
  if (!reportId) throw new Error("reportId is required");

  const { data: report, error: reportError } = await supabaseAdmin.from("fraud_reports").select("*").eq("id", reportId).single();
  if (reportError) throw reportError;

  if (action === "dismiss") {
    const { error } = await supabaseAdmin.from("fraud_reports").update({ status: "dismissed", updated_at: new Date().toISOString() }).eq("id", reportId);
    if (error) throw error;
  } else {
    const { data: caseId, error: caseError } = await supabaseAdmin.rpc("fraud_ensure_case", {
      p_subject_type: report.subject_type,
      p_subject_id: report.subject_id,
      p_reason: `Human report: ${report.reason}`,
    });
    if (caseError) throw caseError;
    const { error } = await supabaseAdmin.from("fraud_reports").update({ status: "linked", case_id: caseId, updated_at: new Date().toISOString() }).eq("id", reportId);
    if (error) throw error;
    await supabaseAdmin.from("fraud_audit_log").insert({ case_id: caseId, event_type: "report_linked", actor_user_id: admin.user_id, payload: { report_id: reportId } });
  }

  revalidatePath("/admin/dashboard/fraud");
  redirect("/admin/dashboard/fraud?view=reports");
}
